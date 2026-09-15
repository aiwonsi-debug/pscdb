'use strict';

const fs = require('fs');
const path = require('path');

function createJsonFileStore({ logger }) {
  const writeQueues = new Map();

  async function read(filePath, options = {}) {
    const {
      allowMissing = false,
      fallback = null
    } = options;

    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');

      if (!raw.trim()) {
        if (allowMissing) {
          return cloneJson(fallback);
        }

        throw new Error(`JSON file is empty: ${filePath}`);
      }

      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) {
        return cloneJson(fallback);
      }

      if (error instanceof SyntaxError) {
        error.message = `Invalid JSON in ${filePath}: ${error.message}`;
      }

      throw error;
    }
  }

  async function writeAtomic(filePath, data, options = {}) {
    const {
      spaces = 2
    } = options;

    const directory = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const tempPath = path.join(
      directory,
      `.${fileName}.${process.pid}.${Date.now()}.tmp`
    );

    const content = `${JSON.stringify(data, null, spaces)}\n`;

    await fs.promises.mkdir(directory, { recursive: true });

    try {
      await fs.promises.writeFile(tempPath, content, {
        encoding: 'utf8',
        mode: 0o600
      });

      /*
       * rename เป็น operation เดียวใน filesystem เดียวกัน
       * จึงลดความเสี่ยงที่ stock_inventory.json จะถูกเขียนค้าง
       */
      await fs.promises.rename(tempPath, filePath);
    } catch (error) {
      await safeUnlink(tempPath);

      if (logger && typeof logger.error === 'function') {
        logger.error('[json-file-store] atomic write failed', {
          filePath,
          message: error.message
        });
      }

      throw error;
    }
  }

  /**
   * ทำ read -> mutate -> atomic write เป็นคิวต่อ filePath
   * ใช้ได้กับทุก JSON data file ที่อยู่ใน process เดียวกัน
   */
  function update(filePath, mutator, options = {}) {
    if (typeof mutator !== 'function') {
      throw new TypeError('jsonFileStore.update requires a mutator function');
    }

    const previous = writeQueues.get(filePath) || Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const current = await read(filePath, options);
        const result = await mutator(current);

        const nextData = result === undefined ? current : result;
        await writeAtomic(filePath, nextData, options);

        return nextData;
      });

    writeQueues.set(filePath, next);

    return next.finally(() => {
      if (writeQueues.get(filePath) === next) {
        writeQueues.delete(filePath);
      }
    });
  }

  function getPendingWriteCount() {
    return writeQueues.size;
  }

  return {
    read,
    writeAtomic,
    update,
    getPendingWriteCount
  };
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // ไฟล์ temp ลบไม่ได้ไม่ควรกลบ error หลักจาก write/rename
    }
  }
}

function cloneJson(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createJsonFileStore
};
