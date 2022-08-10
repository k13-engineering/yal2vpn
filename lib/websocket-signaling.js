import WebSocket from "ws";
import naiveEmitter from "naive-emitter";

const expectedPingInterval = 10000;
const pingTimeout = 3 * expectedPingInterval;

const create = ({ logger, url }) => {
  const connectedEmitter = naiveEmitter.create();
  const discconnectedEmitter = naiveEmitter.create();
  const messageEmitter = naiveEmitter.create();

  let closeRequested = false;

  let open = false;
  let lastEmittedOpen = false;

  const maybeInformAboutConnection = () => {
    if (closeRequested) {
      return;
    }

    if (open === lastEmittedOpen) {
      return;
    }

    if (open) {
      connectedEmitter.emit();
    } else {
      discconnectedEmitter.emit();
    }

    lastEmittedOpen = open;
  };

  let ws = undefined;

  let pingTimeoutHandle = undefined;
  const refreshPingTimeout = () => {
    if (pingTimeoutHandle) {
      clearTimeout(pingTimeoutHandle);
    }

    pingTimeoutHandle = setTimeout(() => {
      pingTimeoutHandle = undefined;

      logger.log("ping timeout");
      ws?.close();
    }, pingTimeout);
  };

  let reconnectTimeout = undefined;

  const connect = () => {
    ws = new WebSocket(url);
    ws.on("open", () => {
      refreshPingTimeout();
  
      logger.log("WebSocket connected");
  
      open = true;
      maybeInformAboutConnection();
    });
    ws.on("ping", () => {
      refreshPingTimeout();
    });
    ws.on("error", (error) => {
      logger.error("WebSocket error", error.message);
      ws.close();
    });
    ws.on("message", (data) => {
      const messageAsBase64 = data.toString("utf-8");
      const message = Buffer.from(messageAsBase64, "base64");

      messageEmitter.emit({ message });
    });
    ws.on("close", () => {
      clearTimeout(pingTimeoutHandle);
      pingTimeoutHandle = undefined;
  
      open = false;
      maybeInformAboutConnection();

      if (closeRequested) {
        logger.log("WebSocket closed");
        return;
      }

      logger.warn("WebSocket closed, reconnecting soon...");

      if (reconnectTimeout) {
        return;
      }

      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = undefined;

        logger.log("reconnecting...");
        connect();
      }, 5000);
    });
  };
  connect();

  const send = ({ packet }) => {
    const packetAsBase64 = packet.toString("base64");
    ws.send(packetAsBase64);
  };

  const close = () => {
    closeRequested = true;

    clearTimeout(reconnectTimeout);
    reconnectTimeout = undefined;

    ws?.close();
  };

  return {
    onConnected: connectedEmitter.on,
    onDisconnected: discconnectedEmitter.on,
    onMessage: messageEmitter.on,

    send,

    close,
  };
};

export default {
  create,
};
