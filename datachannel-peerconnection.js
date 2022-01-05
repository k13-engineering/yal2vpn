import EventEmitter from "events";
import datachannel from "node-datachannel";

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

  channel.onOpen(() => {
    emitter.emit("open");
  });

  channel.onMessage((msg) => {
    emitter.emit("message", { data: msg });
  });

  channel.onClose(() => {
    emitter.emit("close");
  });

  const send = (msg) => {
    channel.sendMessage(msg);
  };

  return {
    send,

    addEventListener: emitter.addEventListener,
  };
};

export default function (options) {
  const pc = new datachannel.PeerConnection("pc", options);

  const emitter = emitterForWeb();
  this.addEventListener = emitter.addEventListener;

  this.setLocalDescription = (desc) => {
    return Promise.resolve(() => {
      pc.setLocalDescription(desc.sdp, desc.type);
    });
  };

  this.setRemoteDescription = (desc) => {
    return Promise.resolve(() => {
      pc.setRemoteDescription(desc.sdp, desc.type);
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
    emitter.emit("channel", {
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
