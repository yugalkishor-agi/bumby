import { registerRootComponent } from 'expo';
import { installAppLogCapture } from './native/utils/appLog';

// Capture console output and unhandled errors from the very start of the
// bundle, before the app module (and everything it logs) is loaded.
installAppLogCapture();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
const App = require('./native/App').default;
registerRootComponent(App);
