import EventEmitter from "events";
import datachannel from "node-datachannel";
import rtpPacket from "./lib/rtp-packet.js";

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
      {
        hostname: "5.44.99.99",
        port: 3478,
        relayType: "TurnUdp",
        username: "test",
        password: "abc",
      },
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

const sendToTrack = ({ track, payload, ssrc }) => {
  if (!track.isOpen()) {
    return;
  }

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
      timestamp: 1,
      ssrc,
      csrc: [],
      extension: null,
      payload,
    },
  });

  track.sendMessageBinary(packetToSend);
};

const createConnection = () => {
  const emitter = new EventEmitter();
  const { pc, track } = createPeerConnectionWithTrack();

  pc.onGatheringStateChange(
    noExceptions((state) => {
      console.log("gathering state =", state);

      if (state === "complete") {
        const desc = pc.localDescription();

        console.log("offer/answer =", desc);

        // "offer" or "answer"
        emitter.emit(desc.type, desc);
      }
    })
  );

  pc.onStateChange(
    noExceptions((state) => {
      console.log("state =", state);

      if (state === "connected") {
        emitter.emit("open");
      }
    })
  );

  let packetReceived = false;
  const heartbeatReceiveInterval = setInterval(() => {
    if (!packetReceived) {
      console.error("heartbeat timeout");
    }
    packetReceived = false;
  }, 10000);

  track.onMessage((msg) => {
    const packet = rtpPacket.parse({ buffer: msg });

    if (packet.ssrc === 4) {
      emitter.emit("packet", packet.payload);
    } else {
      console.log("heartbeat received");
    }

    packetReceived = true;
  });

  const createOffer = () => {
    pc.setLocalDescription();
  };

  const processOfferOrAnswer = ({ type, sdp }) => {
    pc.setRemoteDescription(sdp, type);
  };

  let packetsSent = false;

  const heartbeatInterval = setInterval(() => {
    if (!packetsSent) {
      sendToTrack({ track, payload: Buffer.alloc(1), ssrc: 5 });
    }
    packetsSent = false;
  }, 2000);

  const send = ({ packet: payload }) => {
    packetsSent = true;
    sendToTrack({ track, payload, ssrc: 4 });
  };

  const close = () => {
    clearInterval(heartbeatInterval);
    clearInterval(heartbeatReceiveInterval);
    pc.close();
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    createOffer,
    processOfferOrAnswer,

    send,
    
    close,
  };
};

const create = ({ logger: peerLogger, clientId, peerId, sendToTownhall }) => {
  const connectionId = connectionCounter;
  connectionCounter += 1;

  const logger = createSublogger({
    logger: peerLogger,
    prefix: `[ conn #${connectionId} ]`,
  });

  const emitter = new EventEmitter();
  let connection = undefined;

  const initConnection = () => {
    connection.on("offer", ({ sdp }) => {
      const packet = {
        type: "offer",
        from: clientId,
        to: peerId,
        sdp,
      };

      logger.log("sending SDP offer");
      sendToTownhall({ packet });
    });
    connection.on("answer", ({ sdp }) => {
      const packet = {
        type: "answer",
        from: clientId,
        to: peerId,
        sdp,
      };

      logger.log("sending SDP answer");
      sendToTownhall({ packet });
    });
    connection.on("open", () => {
      // console.log("peer connection open!");
      emitter.emit("connected");
    });
    connection.on("close", () => {
      emitter.emit("disconnected");
    });
    connection.on("packet", (msg) => {
      emitter.emit("packet", msg);
    });
  };

  const processHello = ({ packet }) => {
    logger.log(`received hello from peer ${peerId}`);

    if (!connection) {
      connection = createConnection();
      initConnection();
      connection.createOffer();
    }
  };

  const processOffer = ({ packet }) => {
    logger.log(`received SDP offer from peer ${peerId}`);
    // console.log(`offer from peer ${peerId}`);
    // console.log("got offer");

    if (connection) {
      throw Error("received offer while connected");
    }

    connection = createConnection();
    initConnection();
    connection.processOfferOrAnswer({
      type: "offer",
      sdp: packet.sdp
    });
  };

  const processAnswer = ({ packet }) => {
    if (!connection) {
      throw Error("received answer without open offer");
    }

    logger.log(`received SDP answer`);
    connection.processOfferOrAnswer({
      type: "answer",
      sdp: packet.sdp
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
    if (connection) {
      connection.send({ packet });
    }
  };

  const close = () => {
    connection?.close();
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    processPacket,

    send,
    close,
  };
};

export default {
  create,
};
