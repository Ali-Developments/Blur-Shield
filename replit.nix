{ pkgs }: {
  deps = [
    pkgs.bash
    pkgs.coreutils
    pkgs.curl
    pkgs.nodejs_20
    pkgs.openssl
    pkgs.python311
    pkgs.ffmpeg
    pkgs.which
    pkgs.git
    pkgs.procps
  ];
}
