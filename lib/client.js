import tap from "./tap.js";
import EventEmitter from "events";

export default ({ connection }) => {
  const emitter = new EventEmitter();

  tap.create().then((dev) => {
    dev.handover({ connection });
  // }).catch((err) => {
  //   console.error("error when trying to handover", err);
  //   emitter.emit("error", err);
  // });
  });

  return {
    "on": emitter.on.bind(emitter)
  };
};
