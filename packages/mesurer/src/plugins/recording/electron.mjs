import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const electron = require("./electron.cjs");

export const installMesurerElectron = electron.installMesurerElectron;

export const mesurerElectron = electron.mesurerElectron;
