import { createApp } from "vue";
import App from "./App.vue";
import { createClientRuntime } from "./app";
import "./style.css";

createApp(App).use(createClientRuntime().plugin).mount("#app");
