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
category: "생각/글쓰기"
visibility: public
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

`publishedAt`을 생략하면 게시 명령을 실행한 현재 시각이 사용됩니다. `category`는 `/`로 계층을 표현하며, 새 글에서 생략하면 `미분류`가 됩니다. 기존 글을 다시 upsert할 때 `category`를 생략하면 현재 분류를 보존합니다. `visibility`는 `public`, `friends`, `close_friends`, `private` 중 하나이며 생략한 새 글은 `public`, 기존 글은 현재 공개 범위를 보존합니다. `subtitle`, `thumbnail`, `thumbnailAlt`, `draft`는 선택 사항입니다. 기본값은 공개 글(`draft: false`)입니다.

기존 글의 카테고리만 변경할 수도 있습니다.

```bash
pnpm post category post-slug "생각/글쓰기"
pnpm post visibility post-slug close_friends
```

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

## 웹 로그인

로그인은 외부 제공자 없이 비밀번호 하나로 동작합니다. 이메일과 사용자명은 사용하지 않으며, 비밀번호 원문은 저장하지 않고 Neon에 scrypt 해시만 저장합니다. 로그인 세션의 원본 토큰은 보안 쿠키에만 있고 DB에는 SHA-256 해시만 저장됩니다.

스키마를 적용한 뒤 대화형 터미널에서 로그인 비밀번호를 설정합니다. 비밀번호는 8자 이상이어야 하며 명령 인수나 환경변수로 전달하지 않습니다.

```bash
pnpm db:migrate
pnpm admin:password
```

메인 화면의 `로그인`으로 들어갑니다. 로그인 후에도 공개 홈과 같은 인덱스형 읽기 화면을 유지하며, 계정 메뉴에 `새 글 쓰기`와 `로그아웃`이 표시됩니다. `새 글 쓰기`를 누르면 별도 관리자 페이지로 이동하지 않고 현재 읽기 화면에 제목과 Markdown 본문을 입력하는 빈 시트가 열립니다. 게시할 때 URL slug와 게시 시각을 자동 생성하고 공개 범위를 선택해 저장합니다. 로그인 중에는 각 글에 `수정`과 `언어판 추가`가 표시됩니다. `언어판 추가`에서는 English, 日本語, 简体中文 중 하나와 번역 제목·Markdown 본문만 입력해 즉시 발행합니다. 작성 중에는 한국어 제목과 본문을 번역 입력란 옆에서 함께 볼 수 있고, 모바일에서는 원문 다음에 입력란이 이어집니다. 독자 화면은 글에 실제로 발행된 언어판을 제목 위에 텍스트 링크로 표시합니다. 첫 방문에는 브라우저 언어에 맞는 언어판을 우선하고, 독자가 직접 고른 언어는 다음 글에서도 기억합니다. 해당 언어판과 English가 모두 없으면 한국어 원문을 보여줍니다. 같은 언어판이 이미 있으면 기존 내용을 덮어쓰지 않고 발행을 거절합니다. 초안, 자동 번역, 표현 추천, 별도 번역 작업실은 제공하지 않습니다.

방문자 계정과 친구 관계 데이터는 아직 없으므로 `friends`, `close_friends`, `private` 글은 공개 피드·직접 URL·사이트맵에서 제외되고 로그인한 관리자에게만 보입니다. `public` 글은 누구나 볼 수 있습니다.

로그인이 끝나면 메인 블로그로 바로 돌아가며 별도 `/admin/` 페이지는 제공하지 않습니다. 글 관리 목록과 삭제 UI도 별도로 제공하지 않으며, 삭제나 세부 메타데이터 관리는 `pnpm post` CLI로 수행합니다. 비밀번호를 다시 설정하면 기존 로그인 세션은 모두 즉시 만료됩니다.

## 제품 코드 배포

글이 아니라 사이트 코드가 바뀔 때만 배포합니다.

```bash
pnpm test
pnpm build
pnpm db:migrate
pnpm dlx vercel@latest deploy --prod --yes --scope huseongs-projects
```

Vercel 프로젝트는 `huseongs-projects/huseong-blog-runtime`입니다.
