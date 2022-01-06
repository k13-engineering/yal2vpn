import EventEmitter from "events";
import datachannel from "node-datachannel";

datachannel.initLogger("Verbose");

const emitterForWeb = () => {
  const emitter = new EventEmitter();

  const addEventListener = (eventName, listener) => {
    emitter.on(eventName, listener);
  };

  const emit = (eventName, listener) => {
    emitter.emit(eventName, listener);
  };

  return {
    emit,
    addEventListener,
  };
};

const createSafeContext = ({ error }) => {
  const run = (fn) => {
    try {
      fn();
    } catch (ex) {
      process.nextTick(() => {
        error(ex);
      });
    }
  };

  return {
    run,
  };
};

const wrapChannel = ({ channel }) => {
  const emitter = emitterForWeb();

  const safeCtx = createSafeContext({
    error(err) {
      emitter.emit("error", err);
    },
  });

  let internalReadyState = "connecting";

  channel.onOpen(
    safeCtx.run(() => {
      internalReadyState = "open";
      emitter.emit("open");
    })
  );

  channel.onMessage(
    safeCtx.run((msg) => {
      emitter.emit("message", { data: msg });
    })
  );

  channel.onClosed(
    safeCtx.run(() => {
      internalReadyState = "closed";
      emitter.emit("close");
    })
  );

  channel.onError(
    safeCtx.run((err) => {
      emitter.emit("error", err);
    })
  );

  const send = (msg) => {
    if (typeof msg === "string") {
      channel.sendMessage(msg);
    } else {
      channel.sendMessageBinary(msg);
    }
  };

  return {
    send,

    get readyState() {
      return internalReadyState;
    },

    get bufferedAmount() {
      return channel.bufferedAmount();
    },

    addEventListener: emitter.addEventListener,
  };
};

const convertIceServers = ({ iceServers }) => {};

export default function (options) {
  const pc = new datachannel.PeerConnection("pc", {
    ...options,
    iceServers: options.iceServers || [],
  });

  const emitter = emitterForWeb();
  this.addEventListener = emitter.addEventListener;

  const safeCtx = createSafeContext({
    error(err) {
      emitter.emit("error", err);
    },
  });

  this.setLocalDescription = (desc) => {
    return Promise.resolve().then(() => {
      pc.setLocalDescription(desc.sdp, desc.type);
    });
  };

  this.setRemoteDescription = (desc) => {
    return Promise.resolve().then(() => {
      pc.setRemoteDescription(desc.sdp, desc.type);
    });
  };

  //   pc.onLocalDescription(() => {
  //     console.log("local description =", pc.localDescription());
  //   });

  this.createAnswer = () => {
    return Promise.resolve().then(() => {
      return pc.localDescription();
    });
  };

  this.createOffer = () => {
    return Promise.resolve().then(() => {
      return pc.localDescription();
    });
  };

  pc.onLocalCandidate(safeCtx.run((candidate, mid) => {
    emitter.emit("icecandidate", { candidate });
  }));

  pc.onGatheringStateChange(safeCtx.run((state) => {
    if (state === "complete") {
      emitter.emit("icecandidate", { candidate: null });
    }
  }));

  pc.onDataChannel(safeCtx.run((channel) => {
    emitter.emit("datachannel", {
      channel: wrapChannel({ channel }),
    });
  }));

  Object.defineProperty(this, "localDescription", {
    get() {
      return pc.localDescription();
    },
  });

  Object.defineProperty(this, "remoteDescription", {
    get() {
      return pc.remoteDescription();
    },
  });

  this.createDataChannel = (name) => {
    const channel = pc.createDataChannel(name);
    return wrapChannel({ channel });
  };

  this.close = () => {
    pc.close();
  };
}
