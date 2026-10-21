import { createApp } from 'vue';
// Pinia
import { createPinia } from 'pinia';
// Vuetify
import 'vuetify/styles';

import { createVuetify } from 'vuetify';
import {
  VApp,
  VAlert,
  VAutocomplete,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VCheckbox,
  VAvatar,
  VChip,
  VContainer,
  VDataTable,
  VDialog,
  VDivider,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VIcon,
  VList,
  VListItem,
  VListItemTitle,
  VMain,
  VOverlay,
  VPagination,
  VProgressCircular,
  VProgressLinear,
  VSelect,
  VSpacer,
} from 'vuetify/components';
import { Ripple } from 'vuetify/directives';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { ru } from 'vuetify/locale';
import VueTheMask from 'vue-the-mask';
// Components
import App from './App.vue';
import './reset.sass';
import { Form, Field } from 'vee-validate'
// Create Pinia instance
const pinia = createPinia();

// Create Vuetify instance
const vuetify = createVuetify({
  locale: {
    locale: 'ru', // Установите локализацию по умолчанию на русский
    messages: { ru },
  },
  components: {
    VApp,
    VAlert,
    VAutocomplete,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VCheckbox,
    VAvatar,
    VChip,
    VContainer,
    VDataTable,
    VDialog,
    VDivider,
    VExpansionPanel,
    VExpansionPanelText,
    VExpansionPanelTitle,
    VExpansionPanels,
    VIcon,
    VList,
    VListItem,
    VListItemTitle,
    VMain,
    VOverlay,
    VPagination,
    VProgressCircular,
    VProgressLinear,
    VSelect,
    VSpacer,
  },
  directives: {
    Ripple,
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1867C0',
          secondary: '#5CBBF6',
        }
      },
      dark: {
        colors: {
          primary: '#2196F3',
          secondary: '#424242',
        }
      }
    }
  }
});

// Create Vue app
const app = createApp(App);

// Use plugins and components
app.use(vuetify)
  .use(VueTheMask)
  .use(pinia)
  .component('Form', Form)
  .component('Field', Field)
  .mount('#app');