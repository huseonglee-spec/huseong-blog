/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminSession?: import("./lib/server/auth").AdminSession;
  }
}
