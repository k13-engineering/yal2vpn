/* global describe */
/* global it */

import struct from "../lib/index.js";
import assert from "assert";

describe("abi", () => {
  it("should not support endian-less types without ABI specification", () => {
    assert.throws(() => {
      struct.define(({ field }) => {
        field.UInt32("myfield1");
        field.UInt32("myfield2");
      }).abi({});
    });
  });

  const testEndiannessFor = ({ endianness }) => {
    it("should support structure definition", () => {
      const def = struct.define(({ field }) => {
        field.UInt32("myfield1");
        field.UInt32("myfield2");
      }).abi({ endianness });

      assert.strictEqual(def.size, 8);
      assert.strictEqual(def.offsetof("myfield1"), 0);
      assert.strictEqual(def.sizeof("myfield1"), 4);
      assert.strictEqual(def.offsetof("myfield2"), 4);
      assert.strictEqual(def.sizeof("myfield2"), 4);
    });

    it("should parse data correctly", () => {
      const def = struct.define(({ field }) => {
        field.UInt32("myfield1");
        field.UInt32("myfield2");
      }).abi({ endianness });

      const buf = def.format({});

      buf[`writeUInt32${endianness}`](20, 0);
      buf[`writeUInt32${endianness}`](30, 4);

      const data = def.parse(buf);
      assert.strictEqual(data.myfield1, 20n);
      assert.strictEqual(data.myfield2, 30n);
    });

    it("should format data correctly", () => {
      const def = struct.define(({ field }) => {
        field.UInt32("myfield1");
        field.UInt32("myfield2");
      }).abi({ endianness });

      const buf = def.format({
        "myfield1": 20n,
        "myfield2": 30n
      });

      const myfield1 = buf[`readUInt32${endianness}`](0);
      const myfield2 = buf[`readUInt32${endianness}`](4);

      assert.strictEqual(myfield1, 20);
      assert.strictEqual(myfield2, 30);
    });
  };

  describe("little endian", () => {
    testEndiannessFor({ "endianness": "LE" });
  });

  describe("big endian", () => {
    testEndiannessFor({ "endianness": "BE" });
  });

  describe("data models", () => {
    describe("LP64", () => {
      const endianness = "LE";
      const dataModel = "LP64";

      it("should support structure definition", () => {
        const def = struct.define(({ field }) => {
          field.Pointer("myfield1");
          field.Pointer("myfield2");
        }).abi({ endianness, dataModel });

        assert.strictEqual(def.size, 16);
        assert.strictEqual(def.offsetof("myfield1"), 0);
        assert.strictEqual(def.sizeof("myfield1"), 8);
        assert.strictEqual(def.offsetof("myfield2"), 8);
        assert.strictEqual(def.sizeof("myfield2"), 8);
      });

      it("should parse data correctly", () => {
        const def = struct.define(({ field }) => {
          field.Pointer("myfield1");
          field.Pointer("myfield2");
        }).abi({ endianness, dataModel });

        const buf = def.format({});

        buf.writeBigUInt64LE(20n, 0);
        buf.writeBigUInt64LE(30n, 8);

        const data = def.parse(buf);
        assert.strictEqual(data.myfield1, 20n);
        assert.strictEqual(data.myfield2, 30n);
      });

      it("should format data correctly", () => {
        const def = struct.define(({ field }) => {
          field.Pointer("myfield1");
          field.Pointer("myfield2");
        }).abi({ endianness, dataModel });

        const buf = def.format({
          "myfield1": 20n,
          "myfield2": 30n
        });

        const myfield1 = buf.readBigUInt64LE(0);
        const myfield2 = buf.readBigUInt64LE(8);

        assert.strictEqual(myfield1, 20n);
        assert.strictEqual(myfield2, 30n);
      });
    });
  });

  describe("alignment models", () => {
    describe("LP64 - gcc", () => {
      const endianness = "LE";
      const dataModel = "LP64";
      const alignmentModel = struct.alignmentModels.LP64.gcc;

      it("should align Int8 correctly", () => {
        const def = struct.define(({ field }) => {
          field.Int8("myfield1");
          field.Int8("myfield2");
        }).abi({ endianness, dataModel, alignmentModel });

        assert.strictEqual(def.offsetof("myfield1"), 0);
        assert.strictEqual(def.offsetof("myfield2"), 1);
      });

      it("should align Int16 correctly", () => {
        const def = struct.define(({ field }) => {
          field.Int8("myfield1");
          field.Int16LE("myfield2");
        }).abi({ endianness, dataModel, alignmentModel });

        assert.strictEqual(def.offsetof("myfield1"), 0);
        assert.strictEqual(def.offsetof("myfield2"), 2);
      });

      it("should align Int32 correctly", () => {
        const def = struct.define(({ field }) => {
          field.Int8("myfield1");
          field.Int32LE("myfield2");
        }).abi({ endianness, dataModel, alignmentModel });

        assert.strictEqual(def.offsetof("myfield1"), 0);
        assert.strictEqual(def.offsetof("myfield2"), 4);
      });

      it("should align Int64 correctly", () => {
        const def = struct.define(({ field }) => {
          field.Int8("myfield1");
          field.Int64LE("myfield2");
        }).abi({ endianness, dataModel, alignmentModel });

        assert.strictEqual(def.offsetof("myfield1"), 0);
        assert.strictEqual(def.offsetof("myfield2"), 8);
      });
    });
  });

  const supportedAbiPlatforms = [
    {
      "arch": "x64",
      "platform": "linux"
    }
  ];

  const isHostSupported = supportedAbiPlatforms.some(({ arch, platform }) => {
    return process.arch === arch && process.platform === platform;
  });

  describe("host detection", () => {
    (isHostSupported ? it : it.skip)("should detect host without error", () => {
      struct.define(() => {}).forHost();
    });
  });
});
