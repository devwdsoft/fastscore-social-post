# Fast Score Autopost

Script Node.js chạy theo lịch (cron). Mỗi lần chạy, nó:

1. **Lấy tin**: đọc RSS của Guardian, BBC Sport, Sky Sports, ESPN (`config/feeds.json`), chỉ lấy tin mới trong `MAX_AGE_HOURS` và chưa từng xử lý.
2. **Chọn tin**: OpenAI chấm điểm 1–10 và chọn `POSTS_PER_RUN` tin hay nhất. Chỉ tin đạt từ `MIN_SCORE` trở lên mới được dùng; tin đã đăng gần đây sẽ không bị lặp lại.
3. **Viết bài**: OpenAI đọc bài gốc rồi viết post tiếng Anh theo mẫu (🚨 tiêu đề, 📌 các ý chính, 🗣️ trích dẫn, câu hỏi kéo bình luận, hashtag mở đầu bằng `#fastscore`). Nó cũng soạn chữ cho ảnh và **chấm mức độ nhạy cảm** (low / medium / high).
4. **Tạo ảnh**: 1080×1350, nền tối, màu `#1B7700`, logo FAST SCORE, dùng ảnh og:image của bài gốc. Chữ tự thu nhỏ khi dài.
5. **Đăng bài**:
   - Mức nhạy cảm **thấp hơn** `REVIEW_LEVEL` (mặc định `high`): đăng thẳng lên Facebook Page và nhắn báo vào Telegram.
   - Mức nhạy cảm **≥** `REVIEW_LEVEL`: gửi ảnh và bài nháp vào Telegram kèm nút **✅ Approve & post** / **❌ Reject**. Bấm Approve thì bài mới được đăng.

## Kiến trúc

| Ở đâu | Làm gì |
|---|---|
| **GitHub Actions** (`.github/workflows/autopost.yml`, 2 tiếng một lần) | Lấy tin, gọi OpenAI, tạo ảnh. Tin thường thì đăng thẳng lên Facebook. Tin nhạy cảm thì lưu vào MySQL qua API và gửi lên Telegram để duyệt |
| **Hostinger** (`hostinger/`: PHP + MySQL) | API lưu dữ liệu (tin đã xử lý, lịch sử, bài chờ duyệt kèm ảnh). Webhook Telegram: bấm **Approve** là bài được đăng lên Facebook ngay trong vài giây |

MySQL chỉ nghe ở localhost của Hostinger, không mở ra internet. GitHub chỉ nói chuyện với API qua HTTPS kèm token. Repo có public thì người ta cũng chỉ thấy code, không thấy dữ liệu hay bài chờ duyệt.

## Cài đặt phần Hostinger

1. **Database:** vào hPanel → Databases → phpMyAdmin, chọn database của bạn, mở tab **SQL** và dán nội dung `hostinger/schema.sql`, rồi bấm Go.
2. **Upload code:** dùng File Manager để upload 4 file trong `hostinger/public/` (`index.php`, `telegram.php`, `lib.php`, `.htaccess`) vào thư mục web của subdomain (ví dụ `domains/api.domain-cua-ban.com/public_html/`).
3. **File cấu hình:** copy `hostinger/fastscore-config.sample.php` thành `fastscore-config.php` và đặt vào thư mục **`social/` nằm cạnh `public_html`** (tức `public_html/../social/fastscore-config.php`, không nằm trong `public_html`). Code tự tìm thư mục `social/` ở các cấp phía trên, nên subdomain đặt ở `public_html/` hay `public_html/api/` đều được. Sau đó điền:
   - thông tin database;
   - `api_token` và `telegram_webhook_secret`: hai chuỗi ngẫu nhiên dài, khác nhau (tạo ở https://www.random.org/strings hoặc bằng `php -r "echo bin2hex(random_bytes(32));"`);
   - token Telegram và token Facebook Page.
4. **SSL:** hPanel → Security → SSL, bật SSL cho subdomain.
5. **Kiểm tra API** (thay domain và token):
   ```bash
   curl -H "Authorization: Bearer API_TOKEN" "https://api.domain-cua-ban.com/index.php?action=health"
   # → {"ok":true,"pending":0}
   ```
6. **Bật webhook Telegram** (chạy 1 lần):
   ```bash
   curl -X POST -H "Authorization: Bearer API_TOKEN" "https://api.domain-cua-ban.com/index.php?action=set_webhook"
   # → "telegram":{"ok":true,...}
   ```
Cần PHP 8.1 trở lên. hPanel → Advanced → PHP Configuration, thường mặc định đã là 8.2 hoặc 8.3.

## Cài đặt phần GitHub Actions

1. Vào **Settings → Secrets and variables → Actions → Secrets**, thêm:
   - `STATE_API_URL`: `https://api.domain-cua-ban.com/index.php`
   - `STATE_API_TOKEN`: giống `api_token` trong file cấu hình
   - `OPENAI_API_KEY`, `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
2. (Tuỳ chọn) Tab **Variables**: `OPENAI_MODEL`, `MIN_SCORE`, `POSTS_PER_RUN`, `MAX_AGE_HOURS`, `REVIEW_LEVEL`, `SOURCE_CREDIT`, `DRY_RUN`. Biến nào để trống thì dùng giá trị mặc định.
3. Chạy thử: **Actions → Autopost → Run workflow**. Ô *Dry run* được tick sẵn: kết quả (ảnh và bài viết) được gửi vào Telegram của bạn để xem, **không đăng lên Facebook và không lưu gì**, nên chạy thử bao nhiêu lần cũng được.
4. Khi đã hài lòng, để lịch tự chạy. Muốn tạm dừng thì đặt variable `DRY_RUN=true` hoặc **Disable workflow**.

### Lưu ý
- Lịch mặc định: `7 */2 * * *`, 2 tiếng một lần (giờ VN: 07:07, 09:07, 11:07…), tối đa 12 bài một ngày. Đổi lịch bằng cách sửa dòng `cron:` (giờ UTC = giờ VN trừ 7).
- Repo **public** thì GitHub Actions miễn phí, không giới hạn phút. Repo private thì có 2.000 phút mỗi tháng; mỗi lần chạy tốn khoảng 2 phút, tức khoảng 720 phút/tháng.
- Log chạy của repo public ai cũng xem được. Log chỉ ghi tiêu đề tin và kết quả, không ghi nội dung bài hay key. Các secret luôn hiện thành `***`.
- GitHub có thể chạy lịch trễ 5–30 phút vào giờ cao điểm. Đây là chuyện bình thường.

## Chạy trên máy chủ riêng (PC / VPS)

Không dùng Hostinger thì để trống `STATE_API_URL`: dữ liệu sẽ lưu ở `data/state.json`, ảnh ở `data/out/`, và script tự đọc nút duyệt Telegram (process phải chạy liên tục).

Cần Node.js 20 trở lên.

```bash
npm install
npm run setup-browser      # tải Chromium cho Playwright (chỉ làm 1 lần)
cp .env.example .env       # rồi điền các key
```

Thử giao diện ảnh, không tốn API:

```bash
npm run preview -- duong/dan/anh.jpg     # → data/out/preview.png
```

Chạy thử một lần, không đăng lên Facebook: đặt `DRY_RUN=true` trong `.env`, rồi chạy:

```bash
npm run once
```

Chạy thật theo lịch (giữ process sống, nên dùng pm2):

```bash
npm i -g pm2
pm2 start src/index.js --name fastscore-autopost
pm2 save && pm2 startup
```

## Lấy các key

### OpenAI
Tạo key tại platform.openai.com, rồi điền `OPENAI_API_KEY`. Model mặc định là `gpt-4.1-mini` (rẻ). Model phải hỗ trợ Structured Outputs (JSON schema).

### Facebook Page
Facebook chỉ cho đăng tự động lên **Page**, không đăng được lên trang cá nhân.

1. Tạo app tại developers.facebook.com (loại Business).
2. Vào Graph API Explorer, chọn app, xin quyền `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, rồi lấy User token.
3. Đổi sang token dài hạn:
   `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=USER_TOKEN`
4. Gọi `GET /me/accounts` bằng token dài hạn đó, lấy `id` và `access_token` của Page Fast Score. Page token lấy theo cách này không hết hạn.
5. Điền `FB_PAGE_ID` và `FB_PAGE_ACCESS_TOKEN`.

Khi app còn ở chế độ Development, chỉ admin của app/Page mới đăng được. Như vậy là đủ nếu bạn là admin Page.

### Telegram (duyệt bài)
1. Nhắn cho @BotFather, gõ `/newbot`, lấy token rồi điền `TELEGRAM_BOT_TOKEN`.
2. Nhắn một tin bất kỳ cho bot, sau đó mở `https://api.telegram.org/bot<TOKEN>/getUpdates` để lấy `chat.id`, rồi điền `TELEGRAM_CHAT_ID`. Muốn cả nhóm cùng duyệt thì thêm bot vào group và dùng id của group.
   Làm bước này **trước** khi bật webhook (bước 6 phần Hostinger), vì khi đã bật webhook thì `getUpdates` không còn trả về gì.

Nếu không cấu hình Telegram, bài nhạy cảm sẽ **bị giữ lại, không đăng**.

## Tuỳ chỉnh

| Biến | Ý nghĩa |
|---|---|
| `CRON_SCHEDULE` | Lịch chạy, mặc định `5 */3 * * *` (3 tiếng một lần, ở phút thứ 5) |
| `POSTS_PER_RUN` | Số bài mỗi lần chạy |
| `MIN_SCORE` | Điểm tối thiểu để đăng (1–10) |
| `REVIEW_LEVEL` | `high`: chỉ bài rất nhạy cảm mới cần duyệt; `medium`: duyệt cả bài drama/tin đồn; `low`: duyệt tất cả |
| `SOURCE_CREDIT` | Thêm dòng `Source: <tên báo>` cuối bài |
| `BRAND_COLOR`, `HASHTAG` | Màu và hashtag thương hiệu |

Thêm hoặc bớt nguồn tin trong `config/feeds.json`. Thay đổi giao diện ảnh trong `src/template.js`, hoặc cách viết bài trong prompt ở `src/ai.js`.

## Lưu ý về ảnh

Ảnh og:image của các báo thường thuộc Getty/Reuters/PA/AP. Đăng tự động có thể bị Facebook gỡ bài hoặc bị khiếu nại bản quyền, và Page có thể bị hạn chế nếu vi phạm nhiều lần. Nếu muốn an toàn hơn, sửa `src/run.js` để không truyền `imageDataUri`: ảnh sẽ dùng nền thương hiệu thay cho ảnh báo.
