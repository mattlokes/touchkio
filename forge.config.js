const fs = require("fs");

module.exports = {
  packagerConfig: {
    ignore: [".github", ".gitignore", "install.sh", "forge.config.js"],
  },
  makers: [
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          productName: "TouchKio",
          productDescription: "Kiosk mode application for a Home Assistant dashboard",
          categories: ["Network"],
          icon: "img/icon.png",
        },
      },
    },
    {
      name: "@electron-forge/maker-zip",
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "mattlokes",
          name: "touchkio",
        },
        draft: true,
      },
    },
  ],
  hooks: {
    postMake: async (config, results) => {
      for (const result of results) {
        const artifacts = [];
        result.artifacts.forEach((artifact) => {
          if (artifact.includes("amd64")) {
            const renamed = artifact.replace("amd64", "x64");
            fs.renameSync(artifact, renamed);
            artifacts.push(renamed);
          } else {
            artifacts.push(artifact);
          }
        });
        result.artifacts = artifacts;
      }
    },
  },
};
