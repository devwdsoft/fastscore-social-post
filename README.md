# Fast Score Autopost

Script Node.js chạy theo lịch (cron). Mỗi lần chạy, nó:

1. **Lấy tin**: đọc RSS của Guardian, BBC Sport, Sky Sports, ESPN (`config/feeds.json`), chỉ lấy tin mới trong `MAX_AGE_HOURS` và chưa từng xử lý.
2. **Chọn tin**: OpenAI chấm điểm 1–10 và chọn `POSTS_PER_RUN` tin hay nhất. Chỉ tin đạt từ `MIN_SCORE` trở lên mới được dùng; tin đã đăng gần đây sẽ không bị lặp lại.
3. **Viết bài**: OpenAI đọc bài gốc rồi viết post tiếng Anh theo mẫu (🚨 tiêu đề, 📌 các ý chính, 🗣️ trích dẫn, câu hỏi kéo bình luận, hashtag mở đầu bằng `#fastscore`). Nó cũng soạn chữ cho ảnh và **chấm mức độ nhạy cảm** (low / medium / high).
4. **Tạo ảnh**: 1080×1350, nền tối, màu `#1B7700`, logo FAST SCORE, dùng ảnh og:image của bài gốc. Chữ tự thu nhỏ khi dài.
5. **Đăng bài**:
   - Mức nhạy cảm **thấp hơn** `REVIEW_LEVEL` (mặc định `high`): đăng thẳng lên Facebook Page và nhắn báo vào Telegram.
   - Mức nhạy cảm **≥** `REVIEW_LEVEL`: gửi ảnh và bài nháp vào Telegram kèm nút **✅ Approve & post** / **❌ Reject**. Bấm Approve thì bài mới được đăng.

Mọi ảnh và bài viết được lưu ở `data/out/` (ảnh `.png` và file `.json` cùng tên). Trạng thái chạy nằm trong `data/state.json`.

## Chạy trên GitHub Actions (khuyên dùng)

Không cần máy chủ. Repo đã có sẵn 2 workflow:

| Workflow | Lịch (giờ UTC) | Việc làm |
|---|---|---|
| `Autopost` | `7 */3 * * *`, 3 tiếng một lần (giờ VN: 07:07, 10:07, 13:07…) | Xử lý các nút duyệt đang chờ, rồi lấy tin, viết bài, tạo ảnh và đăng (hoặc gửi Telegram để duyệt) |
| `Review decisions` | `37 * * * *`, mỗi giờ | Chỉ xử lý nút Approve / Reject trên Telegram. Nếu không có bài chờ duyệt thì dừng ngay |

Bấm Approve trên Telegram thì bài được đăng trong vòng **khoảng 1 giờ** (ở lần chạy kế tiếp), không đăng ngay lập tức.

### Cài đặt
1. Vào **Settings → Secrets and variables → Actions → Secrets** và thêm:
   `OPENAI_API_KEY`, `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
2. (Tuỳ chọn) Tab **Variables**: `OPENAI_MODEL`, `MIN_SCORE`, `POSTS_PER_RUN`, `MAX_AGE_HOURS`, `REVIEW_LEVEL`, `SOURCE_CREDIT`, `DRY_RUN`. Biến nào để trống thì dùng giá trị mặc định.
3. Chạy thử: **Actions → Autopost → Run workflow**. Ô *Dry run* được tick sẵn, nên lần này chỉ tạo ảnh, không đăng. Ảnh và bài viết nằm trong mục **Artifacts** của lần chạy, giữ 7 ngày.
4. Khi đã hài lòng, để lịch tự chạy. Muốn tạm dừng thì đặt variable `DRY_RUN=true` hoặc **Disable workflow**.

### Lưu ý
- Trạng thái (tin đã xử lý, bài chờ duyệt, ảnh của bài chờ duyệt) được lưu ở nhánh **`autopost-state`**. Workflow tự tạo nhánh này ở lần chạy đầu. Đừng xoá nhánh này, nếu không bot sẽ quên các tin đã đăng.
- Repo private có **2.000 phút Actions miễn phí mỗi tháng**. Với lịch mặc định, mỗi lần Autopost tốn khoảng 2 phút (khoảng 480 phút/tháng). Review decisions tốn 1 phút cho mỗi lần chạy (khoảng 720 phút/tháng). Tổng khoảng 1.200 phút/tháng. Nếu tăng tần suất thì nhớ tính lại.
- GitHub có thể chạy lịch trễ 5–30 phút vào giờ cao điểm. Đây là chuyện bình thường.
- Workflow dùng sẵn Chrome có trên máy của GitHub, nên không cần `npm run setup-browser`.
- Đổi lịch chạy: sửa dòng `cron:` trong `.github/workflows/*.yml` (giờ UTC = giờ VN trừ 7).

## Chạy trên máy chủ riêng (PC / VPS)

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

Nếu không cấu hình Telegram, bài nhạy cảm sẽ **bị giữ lại, không đăng**. File vẫn được lưu trong `data/out/`.

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
