import './app/style.css';
import { Application } from './app/application.ts';
import { installProtocol } from './export/protocol.ts';

// The constructor observes the export marker before any playback loop can start.
const app = new Application(document.querySelector<HTMLElement>('#app')!);
installProtocol(app);
