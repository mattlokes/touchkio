const os = require("os");
const fs = require("fs");
const path = require("path");
const process = require("child_process");

global.HARDWARE = global.HARDWARE || {
  initialized: false,
  status: "invalid",
  session: {},
  support: {},
  display: {
    status: {
      path: null,
      value: null,
    },
    brightness: {
      path: null,
      value: null,
      max: null,
    },
    notifiers: [],
  },
  keyboard: {
    visible: null,
    notifiers: [],
  },
};

/**
 * Initializes the hardware with the provided arguments.
 *
 * @param {Object} args - The command-line arguments to customize the initialization process.
 * @returns {boolean} Returns true if the initialization was successful.
 */
const init = async (args) => {
  if (!compatibleDevice()) {
    console.warn("Device not supported");
    return false;
  }

  // Init globals
  HARDWARE.session.user = sessionUser();
  HARDWARE.session.type = sessionType();
  HARDWARE.display.status.path = getDisplayStatusPath();
  HARDWARE.support.displayStatus = HARDWARE.display.status.path !== null;
  HARDWARE.display.brightness.path = getDisplayBrightnessPath();
  HARDWARE.support.displayBrightness = HARDWARE.display.brightness.path !== null;
  HARDWARE.display.brightness.max = getDisplayBrightnessMax();
  HARDWARE.support.keyboardVisibility = processRuns("squeekboard");
  HARDWARE.initialized = true;
  HARDWARE.status = "valid";

  // Show supported features
  console.log(`Supported: ${JSON.stringify(HARDWARE.support, null, 2)}`);

  // Show session infos
  console.log("\nUser:", HARDWARE.session.user);
  console.log("Session:", HARDWARE.session.type);

  // Show device infos
  console.log("\nModel:", getModel());
  console.log("Vendor:", getVendor());
  console.log("Serial Number:", getSerialNumber());
  console.log("Host Name:", getHostName());

  // Show system infos
  console.log("\nUp Time:", getUpTime());
  console.log("Memory Size:", getMemorySize());
  console.log("Memory Usage:", getMemoryUsage());
  console.log("Processor Usage:", getProcessorUsage());
  console.log("Processor Temperature:", getProcessorTemperature());

  // Show display infos
  console.log(`\nDisplay Status [${HARDWARE.display.status.path}]:`, getDisplayStatus());
  console.log(`Display Brightness [${HARDWARE.display.brightness.path}]:`, getDisplayBrightness(), "\n");

  // Check for keyboard visibility
  setKeyboardVisibility("OFF", (reply, error) => {
    if (!reply || error) {
      return;
    }
    dbusMonitor("/sm/puri/OSK0", (property, error) => {
      if (!property || error) {
        return;
      }
      HARDWARE.keyboard.visibility = property.Visible === "true";
      HARDWARE.keyboard.notifiers.forEach((notifier) => {
        notifier();
      });
    });
  });

  // Check for display changes
  setInterval(update, 2000);

  return true;
};

/**
 * Updates the shared hardware properties.
 */
const update = () => {
    return;
};

/**
 * Verifies device compatibility by checking the presence of necessary sys paths.
 *
 * @returns {bool} Returns true if all paths exists.
 */
const compatibleDevice = () => {
  if (os.platform() !== "linux") {
    return false;
  }
  const paths = ["/sys/class/drm", "/sys/class/backlight", "/sys/class/thermal"];
  return paths.every((path) => fs.existsSync(path));
};

/**
 * Gets the session user name using `os.userInfo()`.
 *
 * @returns {string|null} Returns session user name or null if an error occurs.
 */
const sessionUser = () => {
  try {
    return os.userInfo().username;
  } catch {}
  return null;
};

/**
 * Gets the session type for the user using `loginctl`.
 *
 * @returns {string|null} Returns session type 'x11'/'wayland' or null if an error occurs.
 */
const sessionType = () => {
  if (!commandExists("loginctl")) {
    return null;
  }
  return execSyncCommand("loginctl", [
    "show-session",
    "$(loginctl show-user $(whoami) -p Display --value)",
    "-p Type --value",
  ]);
};

/**
 * Checks the session type for the logged in user.
 *
 * @returns {bool} Returns true if the session matches the type.
 */
const session = (type) => {
  return HARDWARE.session.type == type;
};

/**
 * Gets the model name using `/sys/firmware/devicetree/base/model` or `/sys/class/dmi/id/product_name`.
 *
 * @returns {string|null} The model name of the device or 'Generic' if not found.
 */
const getModel = () => {
  const paths = ["/sys/firmware/devicetree/base/model", "/sys/class/dmi/id/product_name"];
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return execSyncCommand("sudo", ["cat", path]);
    }
  }
  return "Generic";
};

/**
 * Gets the vendor name using `/sys/class/dmi/id/board_vendor`.
 *
 * @returns {string|null} The vendor name of the device or 'Generic' if not found.
 */
const getVendor = () => {
  const paths = ["/sys/class/dmi/id/board_vendor"];
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return execSyncCommand("sudo", ["cat", path]);
    }
  }
  const model = getModel();
  if (model.includes("Raspberry Pi")) {
    return "Raspberry Pi Ltd";
  }
  return "Generic";
};

/**
 * Gets the serial number using `/sys/firmware/devicetree/base/serial-number` or `/sys/class/dmi/id/product_serial`.
 *
 * @returns {string|null} The serial number of the device or '123456' if not found.
 */
const getSerialNumber = () => {
  const paths = ["/sys/firmware/devicetree/base/serial-number", "/sys/class/dmi/id/product_serial"];
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return execSyncCommand("sudo", ["cat", path]);
    }
  }
  return "123456";
};

/**
 * Gets the host machine id using `/etc/machine-id`.
 *
 * @returns {string} The machine id of the system or '123456' if not found.
 */
const getMachineId = () => {
  return execSyncCommand("cat", ["/etc/machine-id"]) || "123456";
};

/**
 * Gets the host name of the current system using `os.hostname()`.
 *
 * @returns {string} The host name of the system.
 */
const getHostName = () => {
  return os.hostname();
};

/**
 * Gets the up time of the system in minutes using `os.uptime()`.
 *
 * @returns {number} The up time of the system in minutes.
 */
const getUpTime = () => {
  return os.uptime() / 60;
};

/**
 * Gets the total available memory in gibibytes using `os.totalmem()`.
 *
 * @returns {number} The total available memory in GiB.
 */
const getMemorySize = () => {
  return os.totalmem() / 1024 ** 3;
};

/**
 * Gets the current memory usage as a percentage using `os.totalmem()` and `os.freemem()`.
 *
 * @returns {number} The percentage of used memory.
 */
const getMemoryUsage = () => {
  return ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
};

/**
 * Gets the CPU load average over the last 5 minutes as a percentage using `os.loadavg()` and `os.cpus()`.
 *
 * @returns {number} The CPU load average percentage over the last 5 minutes.
 */
const getProcessorUsage = () => {
  return (os.loadavg()[1] / os.cpus().length) * 100;
};

/**
 * Gets the current CPU temperature using `/sys/class/thermal`.
 *
 * @returns {number|null} The CPU temperature in degrees celsius or null if nothing was found.
 */
const getProcessorTemperature = () => {
  const thermal = "/sys/class/thermal";
  for (const zone of fs.readdirSync(thermal)) {
    const typeFile = path.join(thermal, zone, "type");
    const tempFile = path.join(thermal, zone, "temp");
    if (!fs.existsSync(typeFile) || !fs.existsSync(tempFile)) {
      continue;
    }
    const type = fs.readFileSync(typeFile, "utf8").trim();
    if (["cpu-thermal", "x86_pkg_temp", "k10temp", "acpitz"].includes(type)) {
      return parseFloat(fs.readFileSync(tempFile, "utf8").trim()) / 1000;
    }
  }
  return null;
};

/**
 * Gets the current display status path using `/sys/class/drm`.
 *
 * @returns {string|null} The display status path or null if nothing was found.
 */
const getDisplayStatusPath = () => {
  const drm = "/sys/class/drm";
  for (const card of fs.readdirSync(drm)) {
    const statusFile = path.join(drm, card, "status");
    if (!fs.existsSync(statusFile)) {
      continue;
    }
    const content = fs.readFileSync(statusFile, "utf8").trim();
    if (content === "connected") {
      return path.join(drm, card);
    }
  }
  return null;
};

/**
 * Gets the current display power status using `wlopm` or `xset`.
 *
 * @returns {string|null} The display status as 'ON'/'OFF' or null if an error occurs.
 */
const getDisplayStatus = () => {
  if (!HARDWARE.support.displayStatus) {
    return null;
  }
  if (session("wayland") && commandExists("wlopm")) {
    const status = execSyncCommand("wlopm", []);
    if (status !== null) {
      const out = status.split("\n")[0].split(" ");
      return out.pop().toUpperCase();
    }
  } else if (session("x11") && commandExists("xset")) {
    const status = execSyncCommand("xset", ["-q"]);
    if (status !== null) {
      const on = /Monitor is On/.test(status);
      return on ? "ON" : "OFF";
    }
  }
  return null;
};

/**
 * Sets the display power status using `wlopm` or `xset`.
 *
 * This function takes a desired status ('ON' or 'OFF') and executes
 * the appropriate command to set the display status.
 *
 * @param {string} status - The desired status ('ON' or 'OFF').
 * @param {function} callback - A callback function that receives the output or error.
 */
const setDisplayStatus = (status, callback = null) => {
  if (!HARDWARE.support.displayStatus) {
    if (typeof callback === "function") callback(null, "Not supported");
    return;
  }
  if (!["ON", "OFF"].includes(status)) {
    console.error("Status must be 'ON' or 'OFF'");
    if (typeof callback === "function") callback(null, "Invalid status");
    return;
  }
  if (session("wayland") && commandExists("wlopm")) {
    execAsyncCommand("wlopm", [`--${status.toLowerCase()}`, "*"], callback);
  } else if (session("x11") && commandExists("xset")) {
    execAsyncCommand("xset", ["dpms", "force", status.toLowerCase()], callback);
  }
};

/**
 * Gets the current display brightness path using `/sys/class/backlight`.
 *
 * @returns {string|null} The display brightness path or null if nothing was found.
 */
const getDisplayBrightnessPath = () => {
  const backlight = "/sys/class/backlight";
  for (const address of fs.readdirSync(backlight)) {
    const brightnessFile = path.join(backlight, address, "brightness");
    if (!fs.existsSync(brightnessFile)) {
      continue;
    }
    return path.join(backlight, address);
  }
  return null;
};

/**
 * Gets the maximum display brightness value using `/sys/class/backlight/.../max_brightness`.
 *
 * @returns {number|null} The brightness maximum value or null if an error occurs.
 */
const getDisplayBrightnessMax = () => {
  if (!HARDWARE.support.displayBrightness) {
    return null;
  }
  const max = execSyncCommand("cat", [`${HARDWARE.display.brightness.path}/max_brightness`]);
  if (max !== null) {
    return parseInt(max, 10);
  }
  return null;
};

/**
 * Gets the current display brightness level using `/sys/class/backlight/.../brightness`.
 *
 * @returns {number|null} The brightness level as a percentage or null if an error occurs.
 */
const getDisplayBrightness = () => {
  if (!HARDWARE.support.displayBrightness) {
    return null;
  }
  const brightness = execSyncCommand("cat", [`${HARDWARE.display.brightness.path}/brightness`]);
  if (brightness !== null) {
    const max = HARDWARE.display.brightness.max;
    return Math.round((parseInt(brightness, 10) / max) * 100);
  }
  return null;
};

/**
 * Sets the display brightness level using `/sys/class/backlight/.../brightness`.
 *
 * This function takes a brightness value between 1 to 100 percent,
 * maps it to the proper range and writes it to the system.
 *
 * @param {number} brightness - The desired brightness level (1-100).
 * @param {function} callback - A callback function that receives the output or error.
 */
const setDisplayBrightness = (brightness, callback = null) => {
  if (!HARDWARE.support.displayBrightness) {
    if (typeof callback === "function") callback(null, "Not supported");
    return;
  }
  if (typeof brightness !== "number" || brightness < 1 || brightness > 100) {
    console.error("Brightness must be a number between 1 and 100");
    if (typeof callback === "function") callback(null, "Invalid brightness");
    return;
  }
  const max = HARDWARE.display.brightness.max;
  const value = Math.max(1, Math.min(Math.round((brightness / 100) * max), max));
  const proc = execAsyncCommand("sudo", ["tee", `${HARDWARE.display.brightness.path}/brightness`], callback);
  proc.stdin.write(value.toString());
  proc.stdin.end();
};

/**
 * Gets the keyboard visibility using global properties.
 *
 * @returns {string|null} The keyboard visibility as 'ON'/'OFF' or null if an error occurs.
 */
const getKeyboardVisibility = () => {
  if (!HARDWARE.support.keyboardVisibility) {
    return null;
  }
  return HARDWARE.keyboard.visibility ? "ON" : "OFF";
};

/**
 * Sets the keyboard visibility using `dbus-send`.
 *
 * This function takes a desired visibility ('ON' or 'OFF') and executes
 * the appropriate command to show or hide the keyboard.
 *
 * @param {boolean} visibility - The desired visibility ('ON' or 'OFF').
 * @param {function} callback - A callback function that receives the output or error.
 */
const setKeyboardVisibility = (visibility, callback = null) => {
  if (!HARDWARE.support.keyboardVisibility) {
    if (typeof callback === "function") callback(null, "Not supported");
    return;
  }
  if (!["ON", "OFF"].includes(visibility)) {
    console.error("Visibility must be 'ON' or 'OFF'");
    if (typeof callback === "function") callback(null, "Invalid visibility");
    return;
  }
  const visible = visibility === "ON";
  HARDWARE.keyboard.visibility = visible;
  dbusCall("/sm/puri/OSK0", "SetVisible", [`boolean:${visible}`], callback);
};

/**
 * Checks if system upgrades are available using `apt`.
 *
 * @returns {Array<string>} A list of package names that are available for upgrade.
 */
const checkPackageUpgrades = () => {
  if (!commandExists("apt")) {
    return [];
  }
  const output = execSyncCommand("apt", ["list", "--upgradable", "2>/dev/null"]);
  const packages = (output || "").trim().split("\n");
  packages.shift();
  return packages;
};

/**
 * Shuts down the system using `sudo shutdown -h now`.
 *
 * This function executes the command asynchronously.
 * The output of the command will be provided through the callback function.
 *
 * @param {function} callback - A callback function that receives the output or error.
 */
const shutdownSystem = (callback = null) => {
  execAsyncCommand("sudo", ["shutdown", "-h", "now"], callback);
};

/**
 * Reboots the system using `sudo reboot`.
 *
 * This function executes the command asynchronously.
 * The output of the command will be provided through the callback function.
 *
 * @param {function} callback - A callback function that receives the output or error.
 */
const rebootSystem = (callback = null) => {
  execAsyncCommand("sudo", ["reboot"], callback);
};

/**
 * Checks if a process is running using `pidof`.
 *
 * @param {string} name - The process name to check.
 * @returns {boolean} Returns true if the process runs.
 */
const processRuns = (name) => {
  try {
    return !!process.execSync(`pidof ${name}`, { encoding: "utf8" });
  } catch {}
  return false;
};

/**
 * Checks if a command is available using `which`.
 *
 * @param {string} name - The command name to check.
 * @returns {boolean} Returns true if the command is available.
 */
const commandExists = (name) => {
  try {
    return !!process.execSync(`which ${name}`, { encoding: "utf8" });
  } catch {}
  return false;
};

/**
 * Executes a command synchronously and returns the output.
 *
 * @param {string} cmd - The command to execute.
 * @param {Array<string>} args - The arguments for the command.
 * @returns {string|null} The output of the command or null if an error occurs.
 */
const execSyncCommand = (cmd, args = []) => {
  try {
    const output = process.execSync([cmd, ...args].join(" "), { encoding: "utf8" });
    return output.trim().replace(/\0/g, "");
  } catch (error) {
    console.error("Execute Sync:", error.message);
  }
  return null;
};

/**
 * Executes a command asynchronously.
 *
 * @param {string} cmd - The command to execute.
 * @param {Array<string>} args - The arguments for the command.
 * @param {function} callback - A callback function that receives the output or error.
 * @returns {object} The spawned process object.
 */
const execAsyncCommand = (cmd, args = [], callback = null) => {
  let errorOutput = "";
  let successOutput = "";
  let proc = process.spawn(cmd, args);
  proc.stderr.on("data", (data) => {
    if (data) {
      errorOutput += data.toString();
    }
  });
  proc.stdout.on("data", (data) => {
    if (data) {
      successOutput += data.toString();
    }
  });
  proc.on("close", (code) => {
    try {
      if (typeof callback === "function") {
        if (code === 0) {
          callback(successOutput.trim().replace(/\0/g, ""), null);
        } else {
          callback(null, errorOutput.trim().replace(/\0/g, ""));
        }
      }
    } catch (error) {
      console.error("Execute Async:", error.message);
      if (typeof callback === "function") {
        callback(null, error.message);
      }
    }
  });
  return proc;
};

/**
 * Executes a D-Bus method call synchronously using `dbus-send`.
 *
 * @param {string} path - The D-Bus object path.
 * @param {string} method - The D-Bus method name.
 * @param {Array<string>} values - The argument values for the D-Bus method.
 * @param {function} callback - A callback function that receives the output or error.
 */
const dbusCall = (path, method, values, callback = null) => {
  const cmd = "dbus-send";
  const iface = path.slice(1).replace(/\//g, ".");
  const dest = `${iface} ${path} ${iface}.${method} ${values.join(" ")}`;
  const args = ["--print-reply", "--type=method_call", `--dest=${dest}`];
  try {
    const output = process.execSync([cmd, ...args].join(" "), { encoding: "utf8" });
    if (typeof callback === "function") {
      callback(output.trim().replace(/\0/g, ""), null);
    }
  } catch (error) {
    console.error("Call D-Bus:", error.message);
    if (typeof callback === "function") {
      callback(null, error.message);
    }
  }
};

/**
 * Monitors D-Bus property changes asynchronously using `dbus-monitor`.
 *
 * @param {string} path - The D-Bus object path.
 * @param {function} callback - A callback function that receives the changed property.
 * @returns {object} The spawned process object.
 */
const dbusMonitor = (path, callback) => {
  const cmd = "dbus-monitor";
  const args = [`interface='org.freedesktop.DBus.Properties',member='PropertiesChanged',path='${path}'`];
  const proc = process.spawn(cmd, args);
  proc.stdout.on("data", (data) => {
    try {
      const signal = data.toString();
      if (signal.includes("member=PropertiesChanged") && signal.includes(`path=${path}`)) {
        const dicts = [...signal.matchAll(/dict entry\(\s*([^)]*?)\)/g)].map((dict) => dict[1].trim());
        if (dicts.length) {
          dicts.forEach((dict) => {
            const key = dict.match(/string "(.*?)"/);
            const value = dict.match(/(?<=variant\s+)(.*)/);
            if (key && value && typeof callback === "function") {
              callback({ [key[1].trim()]: value[1].trim().split(" ").pop() }, null);
            }
          });
        } else {
          callback({ Visible: `${HARDWARE.keyboard.visibility}` }, null);
        }
      }
    } catch (error) {
      console.error("Monitor D-Bus:", error.message);
      if (typeof callback === "function") {
        callback(null, error.message);
      }
    }
  });
  proc.stderr.on("data", (data) => {
    if (data) {
      console.error("Monitor D-Bus:", data.toString());
      if (typeof callback === "function") {
        callback(null, data.toString());
      }
    }
  });
  return proc;
};

module.exports = {
  init,
  update,
  getModel,
  getVendor,
  getSerialNumber,
  getMachineId,
  getHostName,
  getUpTime,
  getMemorySize,
  getMemoryUsage,
  getProcessorUsage,
  getProcessorTemperature,
  getDisplayStatusPath,
  getDisplayStatus,
  setDisplayStatus,
  getDisplayBrightnessPath,
  getDisplayBrightnessMax,
  getDisplayBrightness,
  setDisplayBrightness,
  getKeyboardVisibility,
  setKeyboardVisibility,
  checkPackageUpgrades,
  shutdownSystem,
  rebootSystem,
};
