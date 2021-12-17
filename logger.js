import { performance } from "perf_hooks";

const create = ({ context = "yal2vpn" }) => {
  let logger = {};

  const startAt = performance.now();

  ["log", "warn", "error"].forEach((level) => {
    logger[level] = (...args) => {
      const now = performance.now();
      const diffInMsec = now - startAt;
      const diffInSec = diffInMsec / 1000;

      const lpad = ({ str, num }) => {
        let result = str;
        while (result.length < num) {
          result = " " + result;
        }
        return result;
      };

      console[level](
        `[${lpad({ str: diffInSec.toFixed(3), num: 10 })}]`,
        ...args
      );
    };
  });

  return logger;
};

export default {
  create,
};
