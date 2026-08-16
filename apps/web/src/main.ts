import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import './styles/tokens.css';
import './styles/base.css';
import './styles/forms.css';

const app = createApp(App);

// Pinia before the router: the navigation guard reads the auth store, and the
// first guard runs during `router.isReady()`.
app.use(createPinia());
app.use(createAppRouter());
app.mount('#app');
