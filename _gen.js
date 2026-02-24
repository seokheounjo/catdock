const fs = require("fs");
const lines = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => lines.push(d));
process.stdin.on("end", () => {
  fs.writeFileSync("test-all-final.js", lines.join(""));
  console.log("Written " + lines.join("").length + " bytes");
});