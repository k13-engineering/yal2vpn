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

const wrapChannel = ({ channel }) => {
  const emitter = emitterForWeb();

  let _readyState = "connecting";

  channel.onOpen(() => {
    _readyState = "open";
    emitter.emit("open");
  });

  channel.onMessage((msg) => {
    emitter.emit("message", { data: msg });
  });

  channel.onClosed(() => {
    _readyState = "closed";
    emitter.emit("close");
  });

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
        return _readyState;
    },

    get bufferedAmount() {
        return channel.bufferedAmount();
    },

    addEventListener: emitter.addEventListener,
  };
};

export default function (options) {
  const pc = new datachannel.PeerConnection("pc", {
    ...options,
    iceServers: options.iceServers || [],
  });

  const emitter = emitterForWeb();
  this.addEventListener = emitter.addEventListener;

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

  pc.onLocalCandidate((candidate, mid) => {
    emitter.emit("icecandidate", { candidate });
  });

  pc.onGatheringStateChange((state) => {
    if (state === "complete") {
      emitter.emit("icecandidate", { candidate: null });
    }
  });

  pc.onDataChannel((channel) => {
    emitter.emit("datachannel", {
      channel: wrapChannel({ channel }),
    });
  });

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
