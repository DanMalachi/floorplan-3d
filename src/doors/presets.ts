import type { DoorLook } from "./look";

/**
 * Named looks: complete, coordinated door styles a house can adopt in one
 * click (design + material + hardware + glass + trim chosen together), then
 * tweak per door. Colours are sRGB hex of the finished surface.
 */
export const LOOK_PRESETS: Record<string, DoorLook> = {
  // --- Interior -------------------------------------------------------------
  "shaker-white": {
    design: "shaker", surface: { kind: "paint", color: "#f2efe8", sheen: "satin" },
    handle: "lever-round", hardware: "stainless-brushed", glass: "frosted", trim: "flat",
  },
  "flush-white-minimal": {
    design: "flush", surface: { kind: "paint", color: "#f4f2ed", sheen: "matte" },
    handle: "lever-square", hardware: "black-matte", glass: "frosted", trim: "minimal",
  },
  "flush-white-oak": {
    design: "flush", surface: { kind: "wood", species: "white-oak", sheen: "matte" },
    handle: "lever-square", hardware: "stainless-brushed", glass: "frosted", trim: "flat",
    trimSurface: { kind: "wood", species: "white-oak", sheen: "matte" },
  },
  "grooved-walnut": {
    design: "flush-grooves", surface: { kind: "wood", species: "american-walnut", sheen: "satin" },
    handle: "lever-square", hardware: "black-matte", glass: "frosted", trim: "stepped",
  },
  "five-panel-greige": {
    design: "panel-5", surface: { kind: "paint", color: "#cfc8bb", sheen: "satin" },
    handle: "lever-round", hardware: "brass-satin", glass: "frosted", trim: "stepped",
    trimSurface: { kind: "paint", color: "#cfc8bb", sheen: "satin" },
  },
  "classic-raised": {
    design: "raised-4", surface: { kind: "paint", color: "#f3f1ea", sheen: "gloss" },
    handle: "knob", hardware: "brass-polished", glass: "frosted", trim: "classic",
    trimSurface: { kind: "paint", color: "#f3f1ea", sheen: "gloss" },
  },
  "black-steel-glass": {
    design: "glass-lites", surface: { kind: "powder", color: "#1d1e20", sheen: "matte" },
    handle: "lever-square", hardware: "black-matte", glass: "clear", trim: "minimal",
  },
  "glazed-oak-fluted": {
    design: "glass-full", surface: { kind: "wood", species: "natural-oak", sheen: "satin" },
    handle: "lever-round", hardware: "nickel-satin", glass: "fluted", trim: "flat",
  },
  "laminate-grey": {
    design: "flush", surface: { kind: "polymer", color: "#8e9193", polymer: "hpl" },
    handle: "lever-square", hardware: "stainless-brushed", glass: "frosted", trim: "flat",
  },
  "supermatte-charcoal": {
    design: "flush", surface: { kind: "polymer", color: "#3a3c3f", polymer: "supermatte" },
    handle: "lever-square", hardware: "gunmetal", glass: "frosted", trim: "minimal",
  },
  // --- Entry ----------------------------------------------------------------
  "walnut-groove-entry": {
    design: "entry-grooves", surface: { kind: "wood", species: "american-walnut", sheen: "satin" },
    handle: "pull-bar", hardware: "black-matte", glass: "fluted", trim: "flat",
  },
  "black-steel-entry": {
    design: "entry-slab", surface: { kind: "powder", color: "#232527", sheen: "satin" },
    handle: "pull-bar", hardware: "stainless-brushed", glass: "grey", trim: "flat",
  },
  "oak-slot-entry": {
    design: "entry-slot", surface: { kind: "wood", species: "natural-oak", sheen: "matte" },
    handle: "pull-bar", hardware: "black-matte", glass: "fluted", trim: "flat",
  },
  "white-upvc-entry": {
    design: "entry-slot", surface: { kind: "polymer", color: "#f3f3f1", polymer: "upvc" },
    handle: "lever-plate", hardware: "stainless-brushed", glass: "frosted", trim: "flat",
  },
  "sage-fibreglass-entry": {
    design: "entry-slab", surface: { kind: "polymer", color: "#7c8a76", polymer: "fibreglass" },
    handle: "lever-plate", hardware: "brass-satin", glass: "frosted", trim: "classic",
  },
  "teak-groove-entry": {
    design: "entry-grooves", surface: { kind: "wood", species: "teak", sheen: "matte" },
    handle: "pull-bar", hardware: "stainless-brushed", glass: "fluted", trim: "flat",
  },
};
