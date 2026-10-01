-- Fast Score autopost — run once in phpMyAdmin (hPanel → Databases → phpMyAdmin → SQL tab)

CREATE TABLE IF NOT EXISTS seen (
  link_key VARCHAR(255) NOT NULL PRIMARY KEY,
  seen_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS history (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title      VARCHAR(500)  NOT NULL,
  link       VARCHAR(1000) NOT NULL,
  status     VARCHAR(20)   NOT NULL,           -- posted | rejected | held
  fb_url     VARCHAR(500)  NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pending (
  id                  VARCHAR(32)   NOT NULL PRIMARY KEY,
  title               VARCHAR(500)  NOT NULL,
  link                VARCHAR(1000) NOT NULL,
  source              VARCHAR(100)  NOT NULL DEFAULT '',
  caption             MEDIUMTEXT    NOT NULL,
  sensitivity_level   VARCHAR(10)   NOT NULL,
  sensitivity_reasons TEXT          NOT NULL,
  image               MEDIUMBLOB    NOT NULL,  -- PNG
  status              VARCHAR(12)   NOT NULL DEFAULT 'pending', -- pending | processing
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
