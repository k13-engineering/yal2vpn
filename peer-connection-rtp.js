import EventEmitter from "events";
import datachannel from "node-datachannel";
import rtpPacket from "./lib/rtp-packet.js";

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
  const track = pc.addTrack(video1);

  return {
    pc,
    track,
  };
};

const sendToTrack = ({ track, payload }) => {
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
      ssrc: 4,
      csrc: [],
      extension: null,
      payload,
    },
  });

  track.sendMessageBinary(packetToSend);
};

const initiate = () => {
  const emitter = new EventEmitter();
  const { pc, track } = createPeerConnectionWithTrack();

  const send = ({ packet: payload }) => {
    sendToTrack({ track, payload });
  };

  const close = () => {
    pc.close();
  };

  pc.onGatheringStateChange(
    noExceptions((state) => {
      if (state === "complete") {
        const desc = pc.localDescription();

        console.log("offer =", desc);

        emitter.emit("offer", desc);
      }
    })
  );
  pc.setLocalDescription();

  pc.onStateChange(
    noExceptions((state) => {
      console.log("state1 =", state);

      if (state === "connected") {
        emitter.emit("open");
      }
    })
  );

  track.onMessage((msg) => {
    const packet = rtpPacket.parse({ buffer: msg });
    emitter.emit("packet", packet.payload);
  });

  const processAnswer = ({ sdp }) => {
    pc.setRemoteDescription(sdp, "answer");
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    processAnswer,
    send,
    
    close,
  };
};

const createFromOffer = ({ sdp }) => {
  const emitter = new EventEmitter();
  const { pc, track } = createPeerConnectionWithTrack();

  const send = ({ packet: payload }) => {
    sendToTrack({ track, payload });
  };

  const close = () => {
    pc.close();
  };

  pc.onGatheringStateChange(
    noExceptions((state) => {
      if (state === "complete") {
        const desc = pc.localDescription();

        console.log("offer =", desc);

        emitter.emit("answer", desc);
      }
    })
  );
  pc.setRemoteDescription(sdp, "offer");

  pc.onStateChange(
    noExceptions((state) => {
      console.log("state1 =", state);

      if (state === "connected") {
        emitter.emit("open");
      }
    })
  );

  track.onMessage((msg) => {
    const packet = rtpPacket.parse({ buffer: msg });
    emitter.emit("packet", packet.payload);
  });

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

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

  const processHello = ({ packet }) => {
    logger.log(`received hello from peer ${peerId}`);

    if (!connection) {
      connection = initiate();
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
    }
  };

  const processOffer = ({ packet }) => {
    logger.log(`received SDP offer from peer ${peerId}`);
    // console.log(`offer from peer ${peerId}`);
    // console.log("got offer");

    connection = createFromOffer({ sdp: packet.sdp });
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

  const processAnswer = ({ packet }) => {
    logger.log(`received SDP answer`);
    connection.processAnswer({ sdp: packet.sdp });
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
