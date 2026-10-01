<?php
// Copy to fastscore-config.php ONE LEVEL ABOVE the subdomain's web folder
// (e.g. next to public_html, not inside it) and fill in the values.
return [
    // hPanel → Databases → MySQL Databases
    'db_host' => 'localhost',
    'db_name' => 'u123456789_fastscore',
    'db_user' => 'u123456789_fastscore',
    'db_pass' => 'CHANGE_ME',

    // Long random string. The same value goes into the GitHub secret STATE_API_TOKEN.
    // Generate one with:  php -r "echo bin2hex(random_bytes(32));"
    'api_token' => 'CHANGE_ME',

    // Telegram bot (same as the GitHub secrets TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)
    'telegram_bot_token' => '123456:ABC...',
    'telegram_chat_id'   => '123456789',
    // Another long random string (letters, digits, _ and - only). Telegram sends it back
    // with every webhook call so nobody else can press "Approve" for you.
    'telegram_webhook_secret' => 'CHANGE_ME',

    // Facebook Page (same as the GitHub secrets FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN)
    'fb_page_id'      => '',
    'fb_page_token'   => '',
    'fb_graph_version' => 'v21.0',

    // true = pressing Approve does NOT publish (for testing)
    'dry_run' => false,
];
