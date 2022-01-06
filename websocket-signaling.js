import EventEmitter from "events";
import WebSocket from "ws";
import ReconnectingWebSocket from "reconnecting-websocket";

const create = ({ logger, url }) => {
  const emitter = new EventEmitter();

  let open = false;
  let lastEmittedOpen = false;
  const maybeInformAboutConnection = () => {
    if (open === lastEmittedOpen) {
      return;
    }

    if (open) {
      emitter.emit("connected");
    } else {
      emitter.emit("disconnected");
    }

    lastEmittedOpen = open;
  };

  const rws = new ReconnectingWebSocket(url, [], {
    WebSocket,
    maxReconnectionDelay: 60000,
  });

  rws.addEventListener("ping", () => {
    logger.log("got ping!");
  });

  const expectedPingInterval = 10000;
  const pingTimeout = 3 * expectedPingInterval;

  let pingTimeoutHandle = undefined;
  const refreshPingTimeout = () => {
    if (pingTimeoutHandle) {
      clearTimeout(pingTimeoutHandle);
    }

    pingTimeoutHandle = setTimeout(() => {
      pingTimeoutHandle = undefined;

      logger.log("ping timeout, reconnecting...");
      rws.refresh();
    }, pingTimeout);
  };

  rws.addEventListener("open", (event) => {
    const ws = event.target;
    ws.on("ping", () => {
      logger.log("received ping");
      refreshPingTimeout();
    });
    refreshPingTimeout();

    logger.log("WebSocket connected");

    open = true;
    maybeInformAboutConnection();
  });

  rws.addEventListener("message", ({ data }) => {
    const msgAsBase64String = data.toString("utf8");
    const msgAsBuffer = Buffer.from(msgAsBase64String, "base64");

    emitter.emit("message", msgAsBuffer);
  });

  rws.addEventListener("close", () => {
    logger.warn("WebSocket closed");

    clearTimeout(pingTimeoutHandle);
    pingTimeoutHandle = undefined;

    open = false;
    maybeInformAboutConnection();
  });

  rws.addEventListener("error", ({ error, message }) => {
    logger.error("WebSocket error", message);
  });

  const send = ({ packet }) => {
    const packetAsBase64 = packet.toString("base64");
    rws.send(packetAsBase64);
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
