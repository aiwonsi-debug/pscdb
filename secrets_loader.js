/**
 * secrets_loader.js — Centralized secret and configuration file loader.
 * Prioritizes files in secrets/<filename>, falling back to root <filename>.
 */
const fs = require('fs');
const path = require('path');

function getSecretPath(filename, baseDir = path.resolve(__dirname)) {
    const secretPath = path.join(baseDir, 'secrets', filename);
    if (fs.existsSync(secretPath)) {
        return secretPath;
    }
    return path.join(baseDir, filename);
}

function readSecretJson(filename, baseDir = path.resolve(__dirname)) {
    const targetPath = getSecretPath(filename, baseDir);
    if (!fs.existsSync(targetPath)) return {};
    try {
        const raw = fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, '');
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function readSecretText(filename, baseDir = path.resolve(__dirname)) {
    const targetPath = getSecretPath(filename, baseDir);
    if (!fs.existsSync(targetPath)) return '';
    try {
        return fs.readFileSync(targetPath, 'utf8').trim();
    } catch (e) {
        return '';
    }
}

module.exports = {
    getSecretPath,
    readSecretJson,
    readSecretText
};
