# huseong.com

이후성의 생각과 경험을 게시하는 데이터베이스 기반 Astro 블로그입니다.

- 공개 사이트: https://huseong.com
- 런타임: Astro SSR on Vercel
- 데이터베이스: Neon Serverless Postgres (`huseong-blog-db`, Free 플랜)
- 글의 source of truth: Neon의 `posts` 테이블

사이트 코드를 다시 배포하지 않아도 DB에 글을 추가하거나 수정하면 다음 요청부터 바로 반영됩니다.

## 이 Hermes 환경에서 글 관리

프로젝트 디렉터리:

```bash
cd /home/huseong/Workspace/huseong-blog
```

현재 `.env.local`에는 Vercel 연동으로 받은 개발용 `DATABASE_URL`이 있으며 Git에서 제외됩니다. 새 환경에서는 다음 명령으로 다시 받습니다.

```bash
pnpm dlx vercel@latest link --yes --project huseong-blog-runtime --scope huseongs-projects
pnpm dlx vercel@latest env pull .env.local --environment=development
```

DB 스키마를 준비하는 멱등 명령:

```bash
pnpm db:migrate
```

글 목록과 원문 조회:

```bash
pnpm post list
pnpm post get every-other-day-running
```

## 글 게시

임시 또는 작업용 Markdown 파일을 만듭니다. 파일명이 영구 URL의 slug가 됩니다.

```md
---
title: "글 제목"
subtitle: "선택 사항"
publishedAt: 2026-07-13T10:26:22-04:00
thumbnail: "https://example.com/image.jpg"
thumbnailAlt: "이미지 설명"
draft: false
---

본문
```

DB에 추가하거나 같은 slug의 글을 수정합니다.

```bash
pnpm post upsert /path/to/post-slug.md
```

`publishedAt`을 생략하면 게시 명령을 실행한 현재 시각이 사용됩니다. `subtitle`, `thumbnail`, `thumbnailAlt`, `draft`는 선택 사항입니다. 기본값은 공개 글(`draft: false`)입니다.

위 명령이 성공하면 Vercel 또는 Git 배포 없이 `https://huseong.com/posts/post-slug/`과 홈 피드에 반영됩니다.

삭제는 명시적 확인 인수가 있어야 합니다.

```bash
pnpm post delete post-slug --yes
```

## 본문 표현

일반 Markdown으로 문단, `#`/`##`/`###` 제목, 굵게, 기울임, 링크, 이미지, 인용문을 작성합니다. 제목이 있으면 목차가 자동 생성됩니다. 임의의 HTML과 스크립트는 제거됩니다.

YouTube:

```md
::youtube[동영상 제목]{#YOUTUBE_VIDEO_ID}
```

일반 동영상:

```md
::video[동영상 제목]{src="https://example.com/video.mp4" poster="https://example.com/poster.jpg"}
```

## 개발과 검증

```bash
pnpm test
pnpm build
pnpm dev
pnpm smoke
```

`pnpm dev`와 production SSR은 매 요청마다 Neon에서 공개 글을 조회하며 응답에 `Cache-Control: no-store`를 사용합니다. 동적 `/sitemap.xml`도 같은 DB를 조회합니다.

## 웹 관리자

관리자 화면은 외부 로그인 제공자 없이 비밀번호 하나로 보호됩니다. 이메일과 사용자명은 사용하지 않으며, 비밀번호 원문은 저장하지 않고 Neon에 scrypt 해시만 저장합니다. 로그인 세션의 원본 토큰은 보안 쿠키에만 있고 DB에는 SHA-256 해시만 저장됩니다.

스키마를 적용한 뒤 대화형 터미널에서 관리자 비밀번호를 설정합니다. 비밀번호는 8자 이상이어야 하며 명령 인수나 환경변수로 전달하지 않습니다.

```bash
pnpm db:migrate
pnpm admin:password
```

웹 관리 경로:

```text
https://huseong.com/admin/
```

관리자 화면에서 다음 작업을 할 수 있습니다.

- 공개 글과 초안 목록 조회
- 새 Markdown 글 작성
- 기존 글 수정
- 게시 일시, 썸네일, 초안 여부 설정

slug는 글을 만든 뒤 변경할 수 없습니다. 동시에 열린 오래된 편집 화면에서 저장하면 최신 변경을 덮어쓰지 않고 충돌 오류를 표시합니다. 비밀번호를 다시 설정하면 기존 관리자 세션은 모두 즉시 만료됩니다. 기존 `pnpm post` 명령은 비상 관리 수단으로 계속 사용할 수 있습니다.

## 제품 코드 배포

글이 아니라 사이트 코드가 바뀔 때만 배포합니다.

```bash
pnpm test
pnpm build
pnpm dlx vercel@latest deploy --prod --yes --scope huseongs-projects
```

Vercel 프로젝트는 `huseongs-projects/huseong-blog-runtime`입니다.
