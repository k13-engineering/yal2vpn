import { performance } from "perf_hooks";

const create = ({
  capacity,
  fillQuantity,
  fillTimeInMs,
  initialCapacity = 0,
}) => {
  let lastFilledAt = performance.now();
  let tokensInBucket = initialCapacity;

  const tokensToFillPerMs = fillQuantity / fillTimeInMs;

  const fill = () => {
    const now = performance.now();

    const dt = now - lastFilledAt;
    const tokensToAdd = tokensToFillPerMs * dt;

    tokensInBucket = Math.min(tokensInBucket + tokensToAdd, capacity);
    lastFilledAt = now;
  };

  const take = ({ tokens }) => {
    fill();

    if (tokens < tokensInBucket) {
      tokensInBucket -= tokens;
      return 0;
    }

    const additionalTokensNeeded = tokens - tokensInBucket;
    const waitTimeInMs = additionalTokensNeeded / tokensToFillPerMs;

    return waitTimeInMs;
  };

  return {
    take,

    tokensInBucket: () => {
      return tokensInBucket;
    },
  };
};

export default {
  create,
};
