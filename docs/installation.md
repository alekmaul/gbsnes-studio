---
title: Installation
nav_order: 2
---

# Installation

Download a build from the [GitHub Releases page](https://github.com/alekmaul/gbsnes-studio/releases),
or build it yourself from source (`yarn make:win` / `yarn make:mac` / `yarn make:linux` on the
`v4` branch).

## Windows

Two versions of SNES Studio are available for Windows. The _Setup_ (Squirrel installer)
version just requires you to unzip, double click and then wait a few seconds while the
application installs. Once installed a shortcut will be added to your desktop automatically
and the application will start. The application will be installed to
`%LocalAppData%\snes_studio` - if you need to install to a different location, use the
_zip_ version instead.

The _zip_ version contains the application files, you can unzip this to any location. Once
unzipped, double click `snes-studio.exe` to start.

## macOS

Unzip the downloaded file and move `SNES Studio.app` to your _Applications_ folder. Double
click to start.

{: .note }
> Only an Intel (x64) build is currently published. On Apple Silicon Macs it runs through
> Rosetta 2 rather than natively.

If you're having trouble building or running your game you may also need to install Apple's
Command Line Tools by opening `Applications/Terminal.app` and entering the following command:

```
xcode-select --install
```

## Ubuntu / Debian-based Linux

For Debian-based Linux distros, download the `.deb` package and run:

```
sudo apt-get update
sudo apt-get install build-essential
sudo dpkg -i snes-studio_<version>_amd64.deb
snes-studio
```

## Fedora / RPM-based Linux

For RPM-based Linux distros, download the `.rpm` package and run:

```
sudo yum install libXScrnSaver make lsb
sudo rpm --ignoreos -i snes-studio-<version>.x86_64.rpm
snes-studio
```

## Troubleshooting

If on Linux you see graphical glitches, or SNES Studio fails to start, try running it with:

```
snes-studio --disable-gpu-sandbox
```
