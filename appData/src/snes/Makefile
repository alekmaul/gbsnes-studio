#---------------------------------------------------------------------------------
# GB Studio - SNES (PVSnesLib) build target
#
# This mirrors the role of appData/src/gb/Makefile for the Game Boy target.
# The generated C / asm data files land in src/data/ (written by the JS
# compiler via ejectBuild) and are picked up automatically by snes_rules.
#
# Config comes from decision D3 of the M0 cadrage:
#   LoROM + FastROM, SRAM 8 KB (SRAMSIZE=03).
# makeBuild.js overrides ROMTITLE / COUNTRY / SRAMSIZE / ROMSIZE per project.
#---------------------------------------------------------------------------------

ifeq ($(strip $(PVSNESLIB_HOME)),)
$(error "PVSNESLIB_HOME is not set (must be a Unix-style path, e.g. /c/snesdev/pvsneslib)")
endif

# D3: FastROM to give the 65816 some headroom for the script VM + actors
FASTROM := 1

export ROMNAME  := game
export ROMTITLE ?= GB STUDIO SNES
export SRAMSIZE ?= 03
export COUNTRY  ?= 01

include ${PVSNESLIB_HOME}/devkitsnes/snes_rules

.PHONY: all rom clean

all: rom

# Keep GB Studio's expected layout: build/rom/<name>.sfc
rom: $(ROMNAME).sfc
	@mkdir -p build/rom
	@cp -f $(ROMNAME).sfc build/rom/$(ROMNAME).sfc
	@echo "ROM ready at build/rom/$(ROMNAME).sfc"

clean: cleanBuildRes cleanRom cleanGfx
	@rm -rf build
