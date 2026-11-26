# Báo cáo QA: `/compress-image` và `/images-to-pdf` (vòng 2: sau khi sửa B1–B9)

Ngày: 2026-11-21 · Thực hiện: Claude Code (Playwright) · Phạm vi: chỉ local. Chưa commit, push hay deploy.
Vòng 1 (baseline) tìm ra B1–B9 và kết luận **BLOCKED**. Bạn đã duyệt hướng sửa. Báo cáo này ghi lại phần sửa, kết quả trước/sau và bằng chứng.

## 1. Kết luận: **READY FOR PREVIEW**

Báo cáo kết luận READY FOR PREVIEW vì đủ các điều kiện bạn đặt ra:

- **B1, B2 và B3 đều có regression test và đều pass.** Ma trận cuối có 0 FAIL. Riêng nhóm B1–B3 được chạy lặp 5 lần × 5 project: 705 passed, 0 failed.
- **Các luồng chính trên static export đều pass** với 5 project: Chromium, Firefox, WebKit, Pixel 7 giả lập, iPhone 13 giả lập. Chi tiết: 383 PASS, 0 FAIL, 8 UNSUPPORTED, 19 NOT RUN, tổng 410 lượt. Mọi lượt NOT RUN đều có lý do ở mục 4.
- **Không còn lỗi làm sai đầu ra hoặc trạng thái** trong các case đã chạy.

Giới hạn kiểm thử vẫn còn (xem mục 9):
- Chưa chạy trên thiết bị thật, chưa chạy Firefox/Safari bản phát hành.
- Thao tác tải WebP bằng UI trên Firefox **không xác minh được trong môi trường tự động** (mục 6).
- Kiểm cấu trúc file chỉ phát hiện file bị cắt hoặc hỏng cấu trúc. Nó không phát hiện dữ liệu nén bị hỏng bên trong một cấu trúc vẫn nguyên vẹn.

**Thay đổi ngoài bảng B1–B9 cần bạn biết:**
1. **B2 được mở rộng sang PNG và WebP.** Lượt chạy sau khi sửa phát hiện PNG bị cắt cụt cũng cho ra kết quả "passed all checks" trên Firefox/WebKit (phần thiếu thành pixel trong suốt `0,0,0,0`), và cũng bị nhúng vào PDF. Đây cùng loại lỗi làm sai đầu ra, nên tôi áp dụng cùng bước xác minh: PNG kiểm chuỗi chunk tới IEND, WebP kiểm kích thước khai báo trong RIFF.
2. **Regression do chính phần sửa B2 gây ra, đã sửa.** Kiểm toàn file làm bước chọn file lâu hơn. Trong lúc đó, lựa chọn format của người dùng bị mặc định của file mới ghi đè, và file cũ vẫn hiện "Selected", vẫn bấm Compress được. Cách sửa: bỏ chọn file cũ ngay khi chọn file mới, hiện "Checking <tên>…", khoá Compress và nhóm Output format cho tới khi kiểm xong. Case C16g kiểm điều này.
3. **`.gitignore` có thêm một dòng `qa-results`** (lý do ở mục 8).
4. **Một test e2e có sẵn được cập nhật** theo hành vi mới đã duyệt (`tests/e2e/compress-image.spec.ts`, test "rejects empty, wrong-type and damaged files"). File PNG hỏng giờ bị từ chối ngay khi chọn, thay vì báo `DECODE_FAILED` sau khi bấm Compress.

## 2. Bảng B1–B9: trước và sau

| ID | Mức | Trước (vòng 1) | Đã sửa | Regression test | Sau |
|---|---|---|---|---|---|
| B1 | High | Kết quả cũ, "Within limit" và nút tải vẫn hiện sau khi đổi thiết lập: 10/10 lần | Thêm `invalidate()` cho Compress, giống Images to PDF. Mọi thay đổi về giới hạn (giá trị, đơn vị, bật/tắt), format, chế độ kích thước, rộng/cao, cho phép thu nhỏ và màu nền đều xoá preview, trạng thái, nút tải và huỷ job. Kết quả về muộn bị guard bỏ qua. | C15 ×9 (7 nhóm thiết lập + `C15-required` + `C15-late`) | PASS 45/45 ở ma trận cuối; 225/225 khi chạy lặp |
| B2 | Medium | JPEG bị cắt cụt cho kết quả "passed all checks" và bị nhúng vào PDF trên Firefox/WebKit | Thêm `checkImageIntegrity` ở core, dùng chung cho cả hai tool, và gọi ở hai lớp: (1) UI, khi chọn hoặc thêm file, nên file lỗi bị bỏ qua kèm tên; (2) worker, trước khi decode. JPEG: duyệt toàn bộ marker, kể cả dữ liệu entropy (FF00, RSTn, fill byte) tới EOI. PNG: chunk tới IEND. WebP: kích thước RIFF. | C21 ×5, C22 ×4, P09, P16, unit `integrity.test.ts` | PASS toàn bộ; 0 nhận nhầm trên 352 JPEG + 614 PNG + 22 WebP thật |
| B3 | Medium | Firefox fail 6/6 lượt, m-chromium 3/6, Chromium 1/6 | Compress: mỗi lần chọn file nhận một số thứ tự (`pickSeq`) trước bước đọc bất đồng bộ; chỉ lần chọn mới nhất được cập nhật UI. Images to PDF: các đợt thêm ảnh đi qua hàng đợi nên giữ đúng thứ tự, và đếm giới hạn dựa trên danh sách hiện tại. | C16b, C16d, C16e, C16f, C16g, P17, P17b | PASS; C16b 5/5 lượt trên mọi project (25/25 lần chọn mỗi project) |
| B4 | Low | Nút chọn màu nền bị ẩn với PNG trong suốt mang tên .jpg | Dùng `mayHaveAlpha(header, định dạng thật)`: kiểm color type của PNG hoặc tRNS, cờ VP8X hoặc VP8L của WebP. | C09b (cả PNG mang tên .jpg và JPEG mang tên .png) | PASS 5/5 |
| B5 | Low | Hai nút có cùng tên "Remove scan.png" | Thao tác theo `id` của từng mục. Accessible name thêm vị trí, ví dụ "Remove scan.png (page 2)". | P03 | PASS 5/5 |
| B6 | Low | Focus nhảy về `BODY` | Sau khi di chuyển, focus giữ trên nút cùng chiều của mục vừa di chuyển, hoặc chuyển sang nút chiều ngược lại nếu nút kia bị disable. Sau khi xoá, focus tới mục thế chỗ, rồi mục trước đó, rồi input chọn file nếu danh sách trống. | P04 | PASS 5/5 |
| B7 | Low | Tổng 200 MB chỉ báo khi bấm Create | Kiểm ngay khi thêm: báo `big-5.png (the images would add up to more than 200 MB)`. Status liệt kê ảnh được nhận, ví dụ "1 image added: small.jpg". Hint ghi "200 MB in total". Worker vẫn giữ kiểm tra trước khi tạo PDF. | P13 | PASS 3/3 desktop |
| B8 | Low | `1.005` KB thành 1.004 B; 1.482 giá trị lệch 1 byte | `toBytes` parse trực tiếp chuỗi thập phân, không nhân số float. Vẫn giữ quy tắc bỏ phần lẻ nhỏ hơn 1 byte (floor); giá trị dưới 1 byte bị từ chối. | Unit: 1–199.999 B ở cả dạng chuỗi và số (0 lệch); biên `0.001`/`0.0009` KB; C06; C07 | PASS |
| B9 | Cosmetic | "1 pages"; 999.999 B hiện "1000.0 KB" | Dùng số ít cho 1 trang. `formatBytes` chuyển sang MB khi làm tròn lên chạm 1000 KB, nên 999.999 B hiện "1.00 MB". So sánh giới hạn vẫn dùng số byte thật. | P01; unit 999.000–999.999 B | PASS |

## 3. Kiểm tra chuẩn của repo (trên build cuối)

| Lệnh | Trước | Sau |
|---|---|---|
| `pnpm lint` | PASS | PASS |
| `pnpm typecheck` | PASS | PASS |
| `pnpm test` (Vitest) | PASS: 44 test / 7 file | PASS: 60 test / 8 file (thêm `packages/core/test/integrity.test.ts`) |
| `pnpm build` | PASS | PASS (12 giây) |
| `node scripts/check-build.mjs` | PASS | PASS: 10 trang, non-production |
| `pnpm test:e2e` | PASS: 74 passed, 1 skipped | PASS: 74 passed, 1 skipped |
| `pnpm build:prod-check` | NOT RUN | NOT RUN: vòng này không thêm trang công khai. Lệnh này cũng thay đổi `apps/web/out`, thư mục mà QA đang dùng. |

## 4. Ma trận QA trên static export

Ký hiệu: PASS / FAIL / UNSUPPORTED / NOT RUN. Lượt cuối: `results-final-3.json`.

**So sánh với baseline:**

| | Lượt | PASS | FAIL | UNSUPPORTED | NOT RUN |
|---|---|---|---|---|---|
| Baseline (vòng 1, lượt 2) | 290 (58 case × 5) | 238 | 28 | 6 | 18 |
| Sau khi sửa (final-3) | 410 (82 case × 5) | 383 | **0** | 8 | 19 |

Ghi chú về con số:
- Tổng tăng do có thêm case: C01w, C15 tách thành 9 case, C16d–g, C21 ×5, C22 ×4, P16, P17, P17b. C23 cũ được gộp vào C21-truncated-png.
- Summarizer tính C01w trên webkit/m-webkit là "NOT RUN", nhưng thực chất là UNSUPPORTED (WebKit không có encoder WebP). Các con số trong bảng trên đã được chỉnh theo đúng phân loại này.

### Compress Image

| Case | chromium | firefox | webkit | m-chromium | m-webkit |
|---|---|---|---|---|---|
| C01 ×9: mọi cặp đầu vào × đầu ra (bytes, đuôi file, decode, pixel, SHA preview==download) | 9 PASS | 9 PASS (WebP kiểm qua Blob, xem mục 6) | 6 PASS, 3 UNSUPPORTED | 9 PASS | 6 PASS, 3 UNSUPPORTED |
| C01w: tải WebP bằng UI | PASS | **NOT RUN** (mục 6) | UNSUPPORTED | PASS | UNSUPPORTED |
| C02 kéo thả · C03 giới hạn mặc định · C04 giới hạn thấp khả thi · C05 bất khả thi · C06 giá trị sai · C07 biên byte | PASS | PASS | PASS | PASS | PASS |
| C09 alpha · C09b (B4) · C10 EXIF ×3 · C11 kích thước cố định · C12 thu nhỏ khi cho phép | PASS | PASS | PASS | PASS | PASS |
| C13a/b WebP và fallback | PASS | PASS | PASS | PASS | PASS |
| C13c FORMAT_MISMATCH | PASS | PASS | NOT RUN¹ | PASS | NOT RUN¹ |
| C14 chất lượng chữ nhỏ | PASS | PASS | PASS | NOT RUN² | NOT RUN² |
| **C15 ×9 (B1)** | PASS | PASS | PASS | PASS | PASS |
| C16a / C16c đổi file khi đang xử lý hoặc đang đọc | PASS | PASS | PASS | NOT RUN² | NOT RUN² |
| **C16b, C16d, C16e, C16f, C16g (B3)** | PASS | PASS | PASS | PASS | PASS |
| C17 thử lại sau lỗi, nhiều click liên tiếp | PASS | PASS | PASS | PASS | PASS |
| C18, C18b, C18c (file lỗi, sai đuôi, tên Unicode) | PASS | PASS | PASS | PASS | PASS |
| C19 50.000.000 / 50.000.001 B · C20c ảnh thật 50 MP | PASS | PASS | PASS | NOT RUN² | NOT RUN² |
| C20a / C20b giới hạn pixel và cạnh | PASS | PASS | PASS | PASS | PASS |
| **C21 ×5 file bị cắt (B2)** · **C22 ×4 JPEG hợp lệ: progressive, progressive+EXIF, dữ liệu sau EOI, EXIF 6** | PASS | PASS | PASS | PASS | PASS |
| X03 chỉ dùng bàn phím | PASS | PASS | PASS | NOT RUN² | NOT RUN² |
| X06 ảnh chụp trạng thái, không cuộn ngang | PASS | PASS | PASS | PASS | PASS |

### Images to PDF

| Case | chromium | firefox | webkit | m-chromium | m-webkit |
|---|---|---|---|---|---|
| P01 (B9) · P02 thứ tự/khổ/hướng · **P03 (B5)** · **P04 (B6)** · P05 kéo thả | PASS | PASS | PASS | PASS | PASS |
| P06 khổ × lề · P07 EXIF/alpha/chữ nhỏ · P08 / P08b giới hạn | PASS | PASS | PASS | PASS | PASS |
| **P09 lô trộn file (B2)** · P10 · P11 · P12 · P15 | PASS | PASS | PASS | PASS | PASS |
| **P13 tổng 200 MB (B7)** · P14 ảnh 50 MP | PASS | PASS | PASS | NOT RUN² | NOT RUN² |
| **P16 PNG/WebP bị cắt (B2 mở rộng)** · **P17, P17b (B3 cho các đợt thêm ảnh)** · X06 | PASS | PASS | PASS | PASS | PASS |

Chú thích NOT RUN:
1. C13c cần một canvas tạo được WebP thật cho bước probe; WebKit không encode được WebP.
2. Giả lập mobile dùng chung engine desktop. Các case nặng (50–250 MB, 50 MP) và case bàn phím chỉ chạy trên desktop.

## 5. Bằng chứng cho từng lỗi

- **B1:** `C15-required` trên Chromium tạo file 98.741 B ở giới hạn 100 KB. Khi đổi giới hạn sang 98,74 KB, không còn "Within limit", nút tải hay ảnh preview. Chạy lại cho ra 95.813 B. Firefox: 83.340 B → 82.577 B. WebKit: 98.499 B → 98.452 B. `C15-late` đổi format 30 ms sau khi job được gửi; job cũ bị dừng hoặc kết quả của nó bị bỏ, không có kết quả nào hiện ra.
- **B2:**
  - Trước khi sửa: WebKit trả ảnh 1200×1800 với nửa dưới xám `128,128,128` kèm "passed all checks"; Firefox trả nửa dưới trắng.
  - Sau khi sửa, khi chọn file Compress báo: "This JPEG is incomplete: the file ends before the image data does…".
  - PDF bỏ qua file khi thêm, kèm thông báo: `truncated.jpg (damaged or incomplete JPEG), truncated-99.jpg (…), progressive-truncated.jpg (…)`. Status ghi "4 images added: page-1.jpg, page-2.png, progressive.jpg, trailing-data.jpg"; PDF có 4 trang, `progressive.jpg` được nhúng đầy đủ 1800 px chiều cao.
  - Nếu worker vẫn báo lỗi, thông báo ghi tên file, ví dụ `truncated.png (page 2): …`, thay vì "Image 2".
  - Kiểm nhận nhầm: 352 JPEG thật đều được nhận, gồm output của encoder Chromium/Firefox/WebKit và ảnh hệ thống macOS (7 file progressive). 614 PNG và 22 WebP thật cũng được nhận, kể cả PNG 50 MB có đệm sau IEND. Chỉ 3 file hỏng cố ý bị chặn.
  - Chi phí: khoảng 11 ms cho JPEG 48–50 MP (đo bằng Node).
- **B3:**
  - C16d: A được đọc chậm có chủ đích (1.500 ms) và đọc xong sau B. UI vẫn giữ "Selected: b-fast.jpg", kết quả 64×48, nút tải là `b-fast.jpg`.
  - C16e và C16f: A lỗi muộn (file không phải ảnh, hoặc JPEG bị cắt). Lỗi của A không hiện.
  - P17: đợt thêm A chậm, đợt B nhanh. Danh sách giữ thứ tự A rồi B.
  - Kỹ thuật điều khiển thứ tự: bọc `Blob.prototype.slice/arrayBuffer` trong trang (`slowReads` trong `tests/qa/qa-helpers.ts`).
- **B6:** chuỗi focus khi đưa page-5 lên đầu: `Move page-5.png up (page 4)` → `(page 3)` → `(page 2)` → `Move page-5.png down (page 1)`. Sau khi xoá, focus tới `Remove page-4.jpg (page 4)`. Khi danh sách trống, focus về input chọn file. Kết quả giống nhau trên Chromium, Firefox và WebKit.

## 6. WebP trên Firefox: hai kết quả riêng

| Kiểm | Kết quả | Ghi chú |
|---|---|---|
| Bytes của link tải xuống (Blob) | **PASS** | C01 ×3 và C09: magic `RIFF…WEBP`, kích thước 640×480 decode được, SHA preview == Blob |
| Tải xuống bằng UI (click link) | **NOT RUN / không xác minh được** | Playwright-Firefox 159 lưu file rồi mở nó trong tab viewer `file://…`, và **không phát sự kiện download**. Trang app sau đó không truy cập được và test bị treo ở bước teardown. Đã thử 3 cách: context mặc định, context riêng, chờ tab. Ở lần thử đầu, file browser đã lưu (`photo-io.webp`, 53.678 B) có SHA trùng Blob, nhưng test không kết thúc sạch được nên không tính là PASS. Cần kiểm tay trên Firefox thật. |

## 7. Hiệu năng (sau khi sửa)

Phương pháp như vòng 1: trang mới cho mỗi lần đo, từ lúc click tới khi kết quả hiện ra, 1 worker, M1 16 GB. Bảng ghi median (ms); số trong ngoặc là baseline.

| Tool / case | Chromium | Firefox | WebKit |
|---|---|---|---|
| Compress small | 78 (79) | 124 (118) | 95 (91) |
| Compress normal | 234 (247) | 258 (253) | 275 (269) |
| Compress large 48 MP | 2.366 (2.369) | 2.203 (2.124) | 3.476 (3.523) |
| PDF small | 127 (127) | 213 (204) | 111 (124) |
| PDF normal 5 trang | 136 (132) | 224 (214) | 202 (198) |
| PDF large 48+50+6 MP | 1.530 (1.557) | 1.665 (1.659) | 2.224 (2.232) |

Không có regression. Bước kiểm cấu trúc chạy lúc chọn file, ngoài khoảng đo này, và tốn khoảng 11 ms cho file 6 MB. Bộ nhớ: chưa đo, giống vòng 1.

## 8. Sự cố trong quá trình QA và cách xử lý

- **Mất bằng chứng của baseline.** Tôi đã chạy `playwright test` bằng cấu hình mặc định mà không có `--output`, nên Playwright xoá toàn bộ `test-results/`, gồm `test-results/qa-two-tools/`: log, JSON, output và ảnh chụp của vòng 1 cùng các lượt đầu sau khi sửa. Số liệu baseline trong báo cáo này lấy từ báo cáo vòng 1, nhưng file bằng chứng gốc không còn. Để tránh lặp lại, thư mục QA được chuyển sang `qa-results/two-tools/` và `.gitignore` có thêm dòng `qa-results`.
- **Harness tự loại nhầm case.** `--grep-invert "T-"` (dùng để loại test perf) so khớp không phân biệt hoa thường, nên các lượt final-1 và final-2 thiếu 11 case có "t-" trong tiêu đề. Đã đổi sang tag `@perf`; lượt final-3 chạy đủ 82 case. Các case bị sót này cũng đã pass trong lượt chạy lặp.
- **Fail được tái hiện trước khi kết luận.** C05 và C15-late fail ở lượt chạy đầu sau khi sửa (Chromium, Firefox). Khi chạy riêng, chúng pass 5/5 nhưng tiếp tục fail ở lượt chạy đầy đủ. Ảnh chụp lượt fail cho thấy output là PNG trong khi test đã chọn JPEG. Nguyên nhân là regression do phần sửa B2, đã sửa (mục 1, ý 2). Sau đó tôi chỉnh helper `choose()` để chờ việc chọn file hoàn tất, giống cách một người dùng chờ. Bằng chứng: `artifacts-final-1/…never-success-firefox/test-failed-1.png`.
- **Thay đổi harness khác:**
  - C20a: file `hdr-16384x100.jpg` chỉ có header nên giờ bị từ chối đúng là "damaged"; kích thước 16384×100 vẫn qua được bước kiểm pixel.
  - P11: selector cập nhật theo aria-label mới.
  - C15: dùng `[role=status]` vì vùng status rỗng không được `getByRole` tìm thấy.

## 9. Lệnh đã chạy

```bash
pnpm lint; pnpm typecheck; pnpm test; pnpm build; node scripts/check-build.mjs
pnpm test:e2e --output=test-results/e2e-artifacts
node tests/qa/make-fixtures.mjs                                   # 97 fixture → qa-results/two-tools/fixtures
pnpm exec playwright test -c tests/qa/playwright.qa.config.ts --grep-invert @perf --output=qa-results/two-tools/artifacts-final-3
pnpm exec playwright test -c tests/qa/playwright.qa.config.ts -g "C15|C16|C21|C22|P09|P16|P17" --repeat-each 5 --output=qa-results/two-tools/artifacts-repeat
pnpm exec playwright test -c tests/qa/playwright.qa.config.ts --grep @perf --workers=1 --project=chromium --project=firefox --project=webkit
node tests/qa/summarize.mjs qa-results/two-tools/results-final-3.json --matrix
```

## 10. File đã thay đổi

**Code sản phẩm:**
- `packages/core/src/integrity.ts` (mới: `checkJpegStructure`, `checkPngStructure`, `checkWebpStructure`, `checkImageIntegrity`, `mayHaveAlpha`)
- `packages/core/src/index.ts`
- `packages/core/src/units.ts` (`toBytes` parse thập phân chính xác, `formatBytes` ở biên KB/MB)
- `apps/web/src/lib/image/compress.ts`, `apps/web/src/lib/pdf/images-to-pdf.ts` (kiểm toàn vẹn trong worker)
- `apps/web/src/components/CompressImageTool.tsx` (B1, B2, B3, B4, trạng thái "Checking…")
- `apps/web/src/components/ImagesToPdfTool.tsx` (B2, B3, B5, B6, B7, B9, thông báo lỗi ghi tên file)
- `apps/web/src/components/LimitInput.tsx` (B8)

**Test:**
- `packages/core/test/integrity.test.ts` (mới, 16 test)
- `tests/e2e/compress-image.spec.ts` (1 test cập nhật theo hành vi B2)
- `tests/qa/*` (bộ QA, fixture thêm truncated-99/trailing-data/progressive/truncated.png/.webp, helper `slowReads` và `pickInPage`)

**Khác:**
- `.gitignore` (+`qa-results`)
- Báo cáo này

## 11. Bằng chứng (trong `qa-results/two-tools/`, đã được git ignore, ≈590 MB)

| Đường dẫn | Nội dung |
|---|---|
| `fixtures/`, `fixtures/manifest.json` | 97 fixture (thêm so với vòng 1: `truncated-99.jpg`, `trailing-data.jpg`, `progressive.jpg`, `progressive-exif6.jpg`, `progressive-truncated.jpg` (tạo bằng ImageMagick 7.1.2), `truncated.png`, `truncated.webp`) |
| `results-final-1/2/3.json`, `matrix-final-3.tsv` | Ma trận. final-1 có 1 FAIL (C05 Firefox, harness); final-2 sạch nhưng thiếu 11 case; final-3 đầy đủ và sạch |
| `results-repeat-b1-b3.json`, `logs/final/repeat-b1-b3.log` | Lượt chạy lặp 5× cho B1–B3 và B2: 705 passed |
| `artifacts-final-1/` | Ảnh chụp và trace của lần fail C05 trên Firefox (regression format bị ghi đè) |
| `out/<project>/<case>/` | File tải xuống, JSON thông số, ảnh chụp (X06, C14) |
| `logs/final/` | lint, typecheck, unit, build, check-build, e2e, qa-final-1/2/3, perf |
| `perf.jsonl`, `results-perf.json` | Số liệu thời gian |

## 12. Chưa kiểm / rủi ro còn lại

- Thiết bị thật (iOS Safari, Android Chrome), Firefox và Safari bản phát hành: chưa kiểm. Thao tác tải WebP bằng UI trên Firefox cần kiểm tay.
- Kiểm cấu trúc file **không** phát hiện file có cấu trúc nguyên vẹn nhưng dữ liệu nén bị hỏng: JPEG có Huffman sai, PNG sai CRC hoặc lỗi zlib bên trong IDAT. Một file bị cắt rồi được gắn lại EOI hoặc IEND giả cũng sẽ lọt qua. Các trường hợp này phụ thuộc vào decoder của browser.
- Bộ nhớ đỉnh: chưa đo. Việc đọc toàn file lúc chọn hoặc thêm tạo thêm một bản sao tạm của file (≤ 50 MB mỗi file, xử lý tuần tự).
- Chưa có fixture cho WebP động, JPEG CMYK, PNG 16-bit, ảnh có profile ICC, hay EXIF có thumbnail lớn hơn 256 KB.
- `pnpm build:prod-check` và deploy Cloudflare Pages: không chạy. Đây là kiểm tra local, không phải production.
