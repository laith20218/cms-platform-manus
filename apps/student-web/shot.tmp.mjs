import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--headless=new','--disable-gpu','--disable-dev-shm-usage','--no-sandbox'] });
