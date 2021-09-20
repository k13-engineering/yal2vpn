import tuntap2 from "../../node-tuntap2/lib/index.js";

const create = async () => {
  const dev = await tuntap2.create({ "type": "tap" });

  const close = () => {
    return dev.close();
  };

  const handleClose = async () => {
    try {
      await dev.close();
    } catch (ex) {
      console.error(ex);
    }
  };

  const handover = ({ connection }) => {
    dev.on("packet", (pkt) => {
      // console.log("packet from device", pkt);
      console.log(` <-- ${pkt.length} bytes`);
      connection.send(pkt);
    });

    connection.on("message", (msg) => {
      console.log(` --> ${msg.length} bytes`);
      // console.log("msg =", msg);
      dev.send(msg).catch((ex) => {
        console.error("error when sending", ex);
      });
    });
    connection.on("error", (err) => {
      console.error("error on client connection", err);
      handleClose();
    });
    connection.on("close", () => {
      console.log("client closed connection");
      handleClose();
    });
  };

  return {
    "ifindex": dev.ifindex,
    "name": dev.name,
    handover,
    close
  };
};

export default {
  create
};
