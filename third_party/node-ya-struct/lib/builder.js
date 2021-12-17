/* global BigInt */

const bufferTypeSizes = {
  "UInt8": 1,
  "UInt16LE": 2,
  "UInt16BE": 2,
  "UInt32LE": 4,
  "UInt32BE": 4,
  "BigUInt64LE": 8,
  "BigUInt64BE": 8,

  "Int8": 1,
  "Int16LE": 2,
  "Int16BE": 2,
  "Int32LE": 4,
  "Int32BE": 4,
  "BigInt64LE": 8,
  "BigInt64BE": 8
};

const dataModelMaps = {
  "LP64": {
    "Pointer": "UInt64"
  }
};

const createAccessorFor = ({ type, offset }) => {
  const readFrom = ({ buffer }) => {
    return BigInt(buffer[`read${type}`](offset));
  };

  const writeTo = ({ buffer, value }) => {
    if (type.indexOf("Big") >= 0) {
      buffer[`write${type}`](value, offset);
    } else {
      buffer[`write${type}`](Number(value), offset);
    }
  };

  return {
    readFrom,
    writeTo
  };
};

const createFieldsViaBuilder = ({ builder, "abi": { endianness, dataModel, alignmentModel = {} } = {} }) => {
  let fields = {};

  let currentOffset = 0;

  const standardField = (type, alignment) => {
    return (name) => {
      const alignmentToUse = Math.max(alignment || 1, 1);
      currentOffset = Math.floor((currentOffset + alignmentToUse - 1) / alignmentToUse) * alignmentToUse;
      const offset = currentOffset;

      const size = bufferTypeSizes[type];
      if (size === undefined) {
        throw new Error(`could not map unknown type "${type}"`);
      }

      const { readFrom, writeTo } = createAccessorFor({ type, offset });

      fields = Object.assign({}, fields, {
        [name]: {
          name,
          readFrom,
          writeTo,
          offset,
          size
        }
      });

      currentOffset += size;
    };
  };

  let fieldObject = {
    "UInt8": standardField("UInt8", alignmentModel.UInt8),
    "UInt16LE": standardField("UInt16LE", alignmentModel.UInt16),
    "UInt16BE": standardField("UInt16BE", alignmentModel.UInt16),
    "UInt32LE": standardField("UInt32LE", alignmentModel.UInt32),
    "UInt32BE": standardField("UInt32BE", alignmentModel.UInt32),
    "UInt64LE": standardField("BigUInt64LE", alignmentModel.UInt64),
    "UInt64BE": standardField("BigUInt64BE", alignmentModel.UInt64),

    "Int8": standardField("Int8", alignmentModel.Int8),
    "Int16LE": standardField("Int16LE", alignmentModel.Int16),
    "Int16BE": standardField("Int16BE", alignmentModel.Int16),
    "Int32LE": standardField("Int32LE", alignmentModel.Int32),
    "Int32BE": standardField("Int32BE", alignmentModel.Int32),
    "Int64LE": standardField("BigInt64LE", alignmentModel.Int64),
    "Int64BE": standardField("BigInt64BE", alignmentModel.Int64)
  };

  if (endianness === "LE" || endianness === "BE") {
    fieldObject = Object.assign({}, fieldObject, {
      "Int16": standardField(`Int16${endianness}`, alignmentModel.Int16),
      "Int32": standardField(`Int32${endianness}`, alignmentModel.Int32),
      "Int64": standardField(`BigInt64${endianness}`, alignmentModel.Int64),
      "UInt16": standardField(`UInt16${endianness}`, alignmentModel.UInt16),
      "UInt32": standardField(`UInt32${endianness}`, alignmentModel.UInt32),
      "UInt64": standardField(`BigUInt64${endianness}`, alignmentModel.UInt64),
    });
  }

  const dataModelMap = dataModelMaps[dataModel] || {};
  Object.keys(dataModelMap).forEach((key) => {
    fieldObject = Object.assign({}, fieldObject, {
      [key]: fieldObject[dataModelMap[key]]
    });
  });

  builder({ "field": fieldObject });

  const size = currentOffset;

  return {
    fields,
    size
  };
};

export default {
  createFieldsViaBuilder
};
