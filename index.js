const arkcache = require("./lib/cachedata.js");
const ArkCacher = new arkcache();

class ArkData {
  refresh() {
    ArkCacher.runCache();
  }
}
module.exports = ArkData;
