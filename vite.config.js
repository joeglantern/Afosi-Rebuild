import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        projects: resolve(__dirname, 'projects.html'),
        programs: resolve(__dirname, 'programs.html'),
        platforms: resolve(__dirname, 'platforms.html'),
        team: resolve(__dirname, 'team.html'),
        news: resolve(__dirname, 'news.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        opportunities: resolve(__dirname, 'opportunities.html'),
        opportunity: resolve(__dirname, 'opportunity.html'),
        apply: resolve(__dirname, 'apply.html'),
        contact: resolve(__dirname, 'contact.html'),
        partners: resolve(__dirname, 'partners.html'),
      },
    },
  },
});
