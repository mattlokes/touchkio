const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline/promises");
const integration = require("./src/integration");
const hardware = require("./src/hardware");
const webview = require("./src/webview");
const { app } = require("electron");

/**
 * This promise resolves when the app has finished initializing,
 * allowing to safely create browser windows and perform other
 * initialization tasks.
 */
app.whenReady().then(async () => {
  //const lock = app.requestSingleInstanceLock();
  //if (!lock) {
  //  console.error("TouchKio is already running");
  //  return app.quit();
  //}
  let args = parseArgs(process);
  let argsProvided = !!Object.keys(args).length;

  args["mqtt"]          = "false";
  args["mqtt_url"]      = "mqtt://192.168.1.42:1883";
  args["mqtt_user"]     = "kiosk";
  args["mqtt_password"] = "password";
  args["mqtt_discovery"]= "homeassistant";


  // Setup arguments from file path
  if (!argsProvided) {
    console.error("Args must be provided");
    return app.quit();
  }

  // Show used arguments
  console.log(`Arguments: ${JSON.stringify(args, null, 2)}`);

  // Chained init functions
  const chained = [webview.init, hardware.init, integration.init];
  for (const init of chained) {
    if (!(await init(args))) {
      break;
    }
  }
});

/**
 * Parses command-line arguments from the given process object.
 *
 * @param {Object} proc - The process object.
 * @returns {Object} An object mapping argument names to their corresponding values.
 */
const parseArgs = (proc) => {
  let args = {};
  proc.argv.slice(1).forEach((arg) => {
    if (arg !== ".") {
      const [key, value] = arg.split("=");
      args[key.replace("--", "").replace("-", "_")] = value;
    }
  });
  return args;
};

/**
 * Writes argument values to the filesystem.
 *
 * @param {string} path - Path of the .json file.
 * @param {Object} args - The arguments object.
 */
const writeArgs = (path, args) => {
  const argc = Object.assign({}, args);
  if ("mqtt_password" in argc) {
    argc.mqtt_password = encrypt(argc.mqtt_password);
  }
  fs.writeFileSync(path, JSON.stringify(argc, null, 2));
};

/**
 * Reads argument values from the filesystem.
 *
 * @param {string} path - Path of the .json file.
 * @returns {Object} The arguments object.
 */
const readArgs = (path) => {
  const args = JSON.parse(fs.readFileSync(path));
  if ("mqtt_password" in args) {
    args.mqtt_password = decrypt(args.mqtt_password);
  }
  return args;
};

/**
 * Helper function for string encryption.
 *
 * @param {string} value - Plain text value.
 * @returns {string} Encrypted value.
 */
const encrypt = (value) => {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(hardware.getMachineId(), app.getName(), 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  return Buffer.from(iv.toString("hex") + ":" + encrypted).toString("base64");
};

/**
 * Helper function for string decryption.
 *
 * @param {string} value - Encrypted value.
 * @returns {string} Plain text value.
 */
const decrypt = (value) => {
  const p = Buffer.from(value, "base64").toString("utf8").split(":");
  const iv = Buffer.from(p.shift(), "hex");
  const key = crypto.scryptSync(hardware.getMachineId(), app.getName(), 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const buffer = Buffer.from(p.join(":"), "hex");
  let decrypted = decipher.update(buffer, "binary", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

/**
 * Helper function for asynchronous sleep.
 *
 * @param {number} ms - Sleep time in milliseconds.
 * @returns {Promise} A promise resolving after the timeout.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
