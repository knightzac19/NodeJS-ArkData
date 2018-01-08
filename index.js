const arkcache = require("./lib/cachedata.js");
const ArkCacher = new arkcache();

class ArkData {
  refresh() {
    ArkCacher.runCache();
  }
}
if(process.argv[2] == "test") {
  ArkCacher.runCache();
}
module.exports = ArkData;
