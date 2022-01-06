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
  const callback = (fn) => {
    return (...args) => {
      try {
        fn(...args);
      } catch (ex) {
        process.nextTick(() => {
          error(ex);
        });
      }
    };
  };

  return {
    callback,
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
    safeCtx.callback(() => {
      internalReadyState = "open";
      emitter.emit("open");
    })
  );

  channel.onMessage(
    safeCtx.callback((msg) => {
      emitter.emit("message", { data: msg });
    })
  );

  channel.onClosed(
    safeCtx.callback(() => {
      internalReadyState = "closed";
      emitter.emit("close");
    })
  );

  channel.onError(
    safeCtx.callback((err) => {
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

  pc.onLocalCandidate(safeCtx.callback((candidate, mid) => {
    emitter.emit("icecandidate", { candidate });
  }));

  pc.onGatheringStateChange(safeCtx.callback((state) => {
    if (state === "complete") {
      emitter.emit("icecandidate", { candidate: null });
    }
  }));

  pc.onDataChannel(safeCtx.callback((channel) => {
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
