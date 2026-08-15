import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    title: 'Penka Survivor Backoffice',
  }),
});
