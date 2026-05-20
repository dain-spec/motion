# Motion Asset Share

팀 내에서 움직이는 JSON(Lottie)과 APNG 파일을 모아 공유하는 GitHub Pages 사이트입니다.

## 1) 로컬 실행

정적 파일이라 별도 빌드가 필요 없습니다.

```bash
cd asset-share-site
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속 후 동작을 확인합니다.

## 2) 폴더 구조

```text
asset-share-site/
  index.html
  styles.css
  app.js
  assets/
    index.json
    json/
    apng/
```

## 3) 업로드(콘텐츠 추가) 방법

웹 업로드는 사용하지 않고, 저장소 커밋/푸시로 업로드합니다.

1. `assets/json/` 또는 `assets/apng/`에 파일 추가
2. `assets/index.json`의 `assets` 배열에 새 항목 추가
3. PR 생성 후 머지
4. GitHub Pages 반영 확인

## 4) 메타데이터 스키마 (`assets/index.json`)

각 항목은 아래 필드를 사용합니다.

- `id`: 고유 ID (소문자-하이픈 권장)
- `type`: `json` 또는 `apng`
- `title`: 표시 제목
- `path`: 파일 상대 경로 (예: `./assets/json/xxx.json`)
- `thumbnail`: 선택값 (없으면 빈 문자열)
- `tags`: 문자열 배열
- `updatedAt`: `YYYY-MM-DD`
- `note`: 팀 공유 메모(사이트 카드에 표시)

예시:

```json
{
  "id": "sample-loader",
  "type": "json",
  "title": "Sample Loader",
  "path": "./assets/json/sample-loader.json",
  "thumbnail": "",
  "tags": ["sample", "loader"],
  "updatedAt": "2026-04-22",
  "note": "팀 공유용 설명 메모"
}
```

## 5) 파일 규칙

- 파일명: 소문자 + 하이픈 (`team-logo-loop.json`)
- 권장 용량: 개별 파일 10MB 이하
- 손상 파일 업로드 금지 (브라우저 미리보기 실패 방지)

## 6) Vercel 배포

빌드 단계 없이 정적 파일을 그대로 배포합니다.

### 대시보드에서 연결 (권장)

1. [vercel.com](https://vercel.com) 로그인 후 **Add New → Project**
2. GitHub 저장소 `dain-spec/motion` import
3. 프로젝트 설정 확인
   - **Framework Preset**: Other
   - **Build Command**: (비움)
   - **Output Directory**: `.` (루트)
4. **Deploy** 클릭

`main` 브랜치에 push할 때마다 자동으로 재배포됩니다.

### CLI로 배포

```bash
npm i -g vercel
cd asset-share-site
vercel          # 최초: 로그인 및 프로젝트 연결
vercel --prod   # 프로덕션 배포
```

### 참고

- 루트의 `vercel.json`은 `assets/` 경로에 캐시 헤더를 설정합니다.
- GitHub Pages와 병행해도 됩니다. Vercel URL은 대시보드의 **Domains**에서 확인합니다.

## 7) GitHub Pages (선택)

1. 저장소를 `Private`로 생성
2. 이 디렉터리 내용을 루트에 커밋
3. `Settings > Pages`에서 `GitHub Actions`를 소스로 선택
4. 팀원에게 저장소 접근 권한 부여

`.github/workflows/deploy-pages.yml`이 `main` push 시 Pages에 배포합니다.

## 8) 배포 체크리스트

- `assets/index.json` 문법 오류 없음
- 새 에셋이 카드 목록에 표시됨
- JSON은 애니메이션 재생됨 (실패 시 에러 문구 표시)
- APNG는 이미지로 재생/노출됨
- 모바일/데스크톱에서 레이아웃 정상
- PR 머지 후 Pages URL에서 최신 항목 확인

## 9) PR 체크리스트 (권장)

- 파일 추가 + `assets/index.json` 동시 수정
- `type`/`path`/`updatedAt` 값 확인
- 로컬 미리보기 확인 후 PR 생성

