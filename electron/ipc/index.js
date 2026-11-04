const { registerWindowIpc } = require('./window');
const { registerSettingsIpc } = require('./settings');
const { registerLibraryIpc } = require('./library');
const { registerReaderIpc } = require('./reader');
const { registerDownloadIpc } = require('./download');
const { registerExportIpc } = require('./export');
const { registerPluginsIpc } = require('./plugins');
const { registerAuthIpc } = require('./auth');
const { registerKindleIpc } = require('./kindle');
const { registerCookiesIpc } = require('./cookies');
const { registerToolsIpc } = require('./tools');
const { registerImagePipelineIpc } = require('./imagePipeline');
const { registerTranslateIpc } = require('./translate');
const { registerWorkflowIpc } = require('./workflow');
const { registerExtrasIpc } = require('./extras');

function registerAllIpc(ipc_context) {
  if (!ipc_context) {
    throw new Error('registerAllIpc requires ipc_context');
  }
  registerWindowIpc(ipc_context);
  registerSettingsIpc(ipc_context);
  registerLibraryIpc(ipc_context);
  registerReaderIpc(ipc_context);
  registerDownloadIpc(ipc_context);
  registerExportIpc(ipc_context);
  registerPluginsIpc(ipc_context);
  registerAuthIpc(ipc_context);
  registerKindleIpc(ipc_context);
  registerCookiesIpc(ipc_context);
  registerToolsIpc(ipc_context);
  registerImagePipelineIpc(ipc_context);
  registerTranslateIpc(ipc_context);
  registerWorkflowIpc(ipc_context);
  registerExtrasIpc(ipc_context);
}

module.exports = { registerAllIpc };
