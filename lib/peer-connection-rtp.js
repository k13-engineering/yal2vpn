/* eslint-disable */
import datachannel from "node-datachannel";
import rtpPacket from "./rtp-packet.js";
import heartbeatHandlerFactory from "./heartbeat.js";
import rateLimiterFactory from "./rate-limiter.js";
import naiveEmitter from "naive-emitter";

// datachannel.initLogger("Debug");

// callback are called from C++ code
// raising an exception in the callbacks
// causes a process abort, so we make sure
// we never throw inside of a callback
const noExceptions = (fn) => {
  return (...args) => {
    try {
      fn(...args);
    } catch (ex) {
      console.error(ex);
    }
  };
};

const createSublogger = ({ logger, prefix }) => {
  let result = {};
  Object.keys(logger).forEach((key) => {
    result = {
      ...result,
      [key]: (...args) => {
        logger[key](prefix, ...args);
      },
    };
  });
  return result;
};

let connectionCounter = 0;

const createPeerConnectionWithTrack = () => {
  const pc = new datachannel.PeerConnection("pc", {
    iceServers: [
      // {
      //   hostname: "5.44.99.99",
      //   port: 3478,
      //   relayType: "TurnUdp",
      //   username: "test",
      //   password: "abc",
      // },
      {
        hostname: "stun.l.google.com",
        port: 19302
      }
    ],
  });

  const video1 = new datachannel.Video("video", "SendRecv");
  video1.addH264Codec(96);
  video1.setBitrate(3000);
  video1.addSSRC(4);
  video1.addSSRC(5);
  const track = pc.addTrack(video1);

  return {
    pc,
    track,
  };
};

const sendRtpPacket = ({ track, payload, ssrc, timestamp }) => {
  let sequenceNumber;

  if (track.sequenceNumber === undefined) {
    sequenceNumber = 1;
  } else {
    sequenceNumber = track.sequenceNumber;
  }

  track.sequenceNumber = (sequenceNumber + 1) % 65536;

  const packetToSend = rtpPacket.format({
    packet: {
      version: 2,
      padding: 0,
      extensions: 0,
      marker: 0,
      payloadType: 96,
      sequenceNumber,
      timestamp,
      ssrc,
      csrc: [],
      extension: null,
      payload,
    },
  });

  track.sendMessageBinary(packetToSend);
};

const chopPayload = ({ payload, maxSize }) => {
  let remaining = payload;
  let result = [];

  while (remaining.length > 0) {
    const chunk = remaining.slice(0, maxSize);
    result = [ ...result, chunk ];

    remaining = remaining.slice(maxSize);
  }

  return result;
};

const PACKET_START_FLAG = 0x01;
const PACKET_END_FLAG = 0x02;

const sendToTrack = ({ track, payload, ssrc }) => {
  if (!track.isOpen()) {
    return;
  }

  const chunks = chopPayload({ payload, maxSize: 1000 });

  let packetNumber;

  if (track.packetNumber === undefined) {
    packetNumber = 1;
  } else {
    packetNumber = track.packetNumber;
  }

  track.packetNumber = (packetNumber + 1) % 65536;

  chunks.forEach((chunk, idx) => {
    let timestamp = packetNumber << 8;

    if (idx === 0) {
      timestamp = timestamp | PACKET_START_FLAG;
    }

    if (idx === chunks.length - 1) {
      timestamp = timestamp | PACKET_END_FLAG;
    }

    sendRtpPacket({ track, payload: chunk, ssrc, timestamp });
  });  
};

const createConnection = () => {
  const { pc, track } = createPeerConnectionWithTrack();

  const offerEmitter = naiveEmitter.create();
  const answerEmitter = naiveEmitter.create();
  const openEmitter = naiveEmitter.create();
  const closeEmitter = naiveEmitter.create();
  const errorEmitter = naiveEmitter.create();
  const packetEmitter = naiveEmitter.create();

  const sendHeartbeat = () => {
    const packetHeartbeat = Buffer.alloc(1);
    packetHeartbeat.writeUInt8(0);
    sendToTrack({ track, payload: packetHeartbeat, ssrc: 5 });
  };

  const heartbeatHandler = heartbeatHandlerFactory.create({
    sendHeartbeat,
  });
  heartbeatHandler.on("timeout", () => {
    track.close();
    pc.close();
    heartbeatHandler.close();

    errorEmitter.emit({ error: Error(`connection timed out`) });
  });

  pc.onGatheringStateChange(
    noExceptions((state) => {
      if (state === "complete") {
        const desc = pc.localDescription();

        // console.log("offer/answer =", desc);

        // "offer" or "answer"
        if (desc.type === "offer") {
          offerEmitter.emit({ offer: desc });
        } else if (desc.type === "answer") {
          answerEmitter.emit({ answer: desc });
        }
      }
    })
  );

  pc.onStateChange(
    noExceptions((state) => {
      if (state === "connected") {
        openEmitter.emit();
      } else if (state === "disconnected") {
        heartbeatHandler.close();

        track.close();
        pc.close();

        closeEmitter.emit();
      } else if (state === "closed") {
        heartbeatHandler.close();
        closeEmitter.emit();
      }
    })
  );

  let lastPacketNumber = undefined;
  let lastSequenceNumber = undefined;
  let cachedPackets = [];

  const processPackets = ({ packets, packetNumber }) => {
    if (packets.length === 0) {
      return;
    }

    // console.log(`received packetNumber ${packetNumber} has chunks`, packets);

    const firstPacket = packets[0];
    const lastPacket = packets[packets.length - 1];

    const firstPacketFlags = firstPacket.timestamp & 0xFF;
    const lastPacketFlags = lastPacket.timestamp & 0xFF;

    if ((firstPacketFlags & PACKET_START_FLAG) === 0) {
      throw Error(`first packet has no start flags`);
    }

    if ((lastPacketFlags & PACKET_END_FLAG) === 0) {
      throw Error(`last packet has no end flag`);
    }

    let expectedSequenceNumber = firstPacket.sequenceNumber;

    let chunks = [];

    packets.forEach((packet) => {
      const flags = packet.timestamp & 0xFF;

      if (packet !== firstPacket && packet !== lastPacket && flags > 0) {
        throw Error(`invalid flags set in packet`);
      }

      if (packet.sequenceNumber !== expectedSequenceNumber) {
        throw Error(`sequence number has holes`);
      }

      expectedSequenceNumber = (expectedSequenceNumber + 1) % 65536;

      chunks = [ ...chunks, packet.payload ];
    });

    const ethernetPacket = Buffer.concat(chunks);

    if (firstPacket.ssrc === 4) {
      // console.log(`received ethernet frame of size ${ethernetPacket.length}`);
      packetEmitter.emit({ packet: ethernetPacket });
    }
  }

  track.onMessage((msg) => {
    const packet = rtpPacket.parse({ buffer: msg });
    // console.log("message incoming", packet);

    const flags = packet.timestamp & 0xFF;
    const packetNumber = packet.timestamp >> 8;

    if (lastSequenceNumber === undefined) {
      lastSequenceNumber -= 1;
    }

    const expectedSequenceNumber = (lastSequenceNumber + 1) % 65536;

    if (packet.sequenceNumber !== expectedSequenceNumber) {
      if (packet.sequenceNumber < expectedSequenceNumber) {
        // console.error(`lost due to reordering ${packet.sequenceNumber}, expected ${expectedSequenceNumber}`);
      } else {
        // console.error(`uncontingous sequence number ${packet.sequenceNumber}, expected ${expectedSequenceNumber}`);
      }
    }

    lastSequenceNumber = packet.sequenceNumber;

    if (packetNumber !== lastPacketNumber) {
      if (cachedPackets.length > 0) {
        // console.log(`lost a packet, packetNumber = ${packetNumber}, lastPacketNumber = ${lastPacketNumber}`);
      }
      cachedPackets = [];
    }

    cachedPackets = [ ...cachedPackets, packet ];

    if ((flags & PACKET_END_FLAG) > 0) {
      try {
        processPackets({ packets: cachedPackets, packetNumber });
      } catch (ex) {
        console.warn("failed to assemble packet", ex);
      }

      cachedPackets = [];
    }

    lastPacketNumber = packetNumber;

    heartbeatHandler.receivedPacket();
  });

  const createOffer = () => {
    pc.setLocalDescription();
  };

  const processOfferOrAnswer = ({ type, sdp }) => {
    pc.setRemoteDescription(sdp, type);
  };

  const send = ({ packet: payload }) => {
    sendToTrack({ track, payload, ssrc: 4 });
    heartbeatHandler.sentPacket();
  };

  const close = () => {
    heartbeatHandler.close();
    track.close();
    pc.close();
  };

  return {
    onOffer: offerEmitter.on,
    onAnswer: answerEmitter.on,
    onOpen: openEmitter.on,
    onPacket: packetEmitter.on,
    onClose: closeEmitter.on,
    onError: errorEmitter.on,

    createOffer,
    processOfferOrAnswer,

    send,

    close,
  };
};

const create = ({ logger: peerLogger, clientId, peerId, sendToTownhall }) => {
  const connectionId = connectionCounter;
  connectionCounter += 1;

  const openEmitter = naiveEmitter.create();
  const closeEmitter = naiveEmitter.create();
  const errorEmitter = naiveEmitter.create();
  const packetEmitter = naiveEmitter.create();

  const rateLimiter = rateLimiterFactory.create({
    send: ({ packet }) => {
      peerConnection.send({ packet });
    }
  });
  rateLimiter.configure({
    maxBurstInBytes: 2000,
    rateInMbitPerSec: 5
  });

  const logger = createSublogger({
    logger: peerLogger,
    prefix: `[ conn #${connectionId} ]`,
  });

  let peerConnection = undefined;

  const createPeer = () => {
    const conn = createConnection();
    conn.onOffer(({ offer }) => {
      const packet = {
        type: "offer",
        from: clientId,
        to: peerId,
        sdp: offer.sdp,
      };

      logger.log("sending SDP offer");
      sendToTownhall({ packet });
    });
    conn.onAnswer(({ answer }) => {
      const packet = {
        type: "answer",
        from: clientId,
        to: peerId,
        sdp: answer.sdp,
      };

      logger.log("sending SDP answer");
      sendToTownhall({ packet });
    });
    conn.onOpen(() => {
      openEmitter.emit();
    });
    conn.onError(({ error }) => {
      errorEmitter.emit({ error });
    });
    conn.onClose(() => {
      closeEmitter.emit();
    });
    conn.onPacket(({ packet }) => {
      packetEmitter.emit({ packet });
    });

    return conn;
  };

  const processHello = ({ packet }) => {
    logger.log(`received hello from peer ${peerId}`);

    if (!peerConnection) {
      peerConnection = createPeer();
      peerConnection.createOffer();
    }
  };

  const processOffer = ({ packet }) => {
    logger.log(`received SDP offer from peer ${peerId}`);
    // console.log(`offer from peer ${peerId}`);
    // console.log("got offer");

    if (peerConnection) {
      throw Error("received offer while connected");
    }

    peerConnection = createPeer();
    peerConnection.processOfferOrAnswer({
      type: "offer",
      sdp: packet.sdp,
    });
  };

  const processAnswer = ({ packet }) => {
    if (!peerConnection) {
      throw Error("received answer without open offer");
    }

    logger.log(`received SDP answer`);
    peerConnection.processOfferOrAnswer({
      type: "answer",
      sdp: packet.sdp,
    });
  };

  const handlers = {
    hello: processHello,
    offer: processOffer,
    answer: processAnswer,
  };

  const processPacket = ({ packet }) => {
    // console.log("peer packet =", packet);

    const handler = handlers[packet.type];
    if (!handler) {
      throw Error(`unsupported packet type "${packet.type}`);
    }

    handler({ packet });
  };

  const send = ({ packet }) => {
    if (peerConnection) {
      return rateLimiter.send({ packet });
    }

    return { shouldDrain: false };
  };

  const close = () => {
    peerConnection?.close();
  };

  return {
    onOpen: openEmitter.on,
    onClose: closeEmitter.on,
    onPacket: packetEmitter.on,
    onError: errorEmitter.on,
    onDrain: rateLimiter.onDrain,

    processPacket,

    send,
    close,
  };
};

export default {
  create,
};
