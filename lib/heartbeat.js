import EventEmitter from "events";

const create = ({
  sendHeartbeat,
  heartbeatTimeout = 20000,
  heartbeatInterval = 4000,
}) => {
  const emitter = new EventEmitter();

  let anyPacketSent = false;
  let anyPacketReceived = false;

  const heartbeatReceiveInterval = setInterval(() => {
    if (!anyPacketReceived) {
      emitter.emit("timeout");
    }
    anyPacketReceived = false;
  }, heartbeatTimeout);

  const heartbeatSendInterval = setInterval(() => {
    if (!anyPacketSent) {
      sendHeartbeat();
    }

    anyPacketSent = false;
  }, heartbeatInterval);

  const receivedPacket = () => {
    anyPacketReceived = true;
  };

  const sentPacket = () => {
    anyPacketSent = true;
  };

  const close = () => {
    clearInterval(heartbeatReceiveInterval);
    clearInterval(heartbeatSendInterval);
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    sentPacket,
    receivedPacket,

    close,
  };
};

export default {
  create,
};
