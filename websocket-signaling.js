import EventEmitter from "events";
import WebSocket from "ws";

const create = () => {
  const emitter = new EventEmitter();

  const wsc = new WebSocket("ws://localhost:7777");

  wsc.on("open", () => {
    emitter.emit("connected");
  });

  wsc.on("message", (msg) => {
    const msgAsBase64String = msg.toString("utf8");
    const msgAsBuffer = Buffer.from(msgAsBase64String, "base64");

    emitter.emit("message", msgAsBuffer);
  });

  const send = ({ packet }) => {
    const packetAsBase64 = packet.toString("base64");
    wsc.send(packetAsBase64);
  };

  return {
    send,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
  };
};

export default {
  create,
};
