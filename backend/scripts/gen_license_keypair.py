"""生成授权用的 ed25519 密钥对。

私钥写入用户指定的、仓库目录之外的文件（路径在仓库内会被拒绝）；
公钥打印到屏幕，供填入 .env.beta 的 LICENSE_PUBLIC_KEY。
私钥内容不会打印，也不会写进仓库。

用法：
    python backend/scripts/gen_license_keypair.py --private-key-file D:/keys/gztx-license.key
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.license_verify import generate_ed25519_keypair  # noqa: E402


def find_repo_roots() -> list[Path]:
    """返回需要保护的目录：backend 目录，以及向上找到的仓库根（含 .git 或 docker-compose.prod.yml）。"""
    here = Path(__file__).resolve()
    roots = [here.parents[1]]
    for parent in here.parents:
        if (parent / ".git").exists() or (parent / "docker-compose.prod.yml").exists():
            roots.append(parent)
            break
    return roots


def is_inside_repo(path: Path, roots: list[Path] | None = None) -> bool:
    target = path.expanduser().resolve()
    for root in roots if roots is not None else find_repo_roots():
        try:
            target.relative_to(root.resolve())
            return True
        except ValueError:
            continue
    return False


def write_private_key(private_key: str, dest: Path, roots: list[Path] | None = None) -> Path:
    dest = dest.expanduser().resolve()
    if is_inside_repo(dest, roots):
        raise ValueError(f"私钥文件不能放在项目目录内：{dest}。请换一个项目之外的位置。")
    if dest.exists():
        raise FileExistsError(f"文件已存在，不会覆盖：{dest}（旧私钥丢失后已签发的授权无法再续期，请先确认）")
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(dest), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as f:
        f.write(private_key + "\n")
    return dest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成授权 ed25519 密钥对")
    parser.add_argument("--private-key-file", required=True, help="私钥保存位置（必须在项目目录之外）")
    args = parser.parse_args(argv)

    private_key, public_key = generate_ed25519_keypair()
    try:
        dest = write_private_key(private_key, Path(args.private_key_file))
    except (ValueError, FileExistsError) as e:
        print(f"失败：{e}", file=sys.stderr)
        return 2

    print(f"私钥已保存到：{dest}")
    print("请立即备份该文件到安全位置（U 盘/密码管理器），不要发给任何人、不要放进项目目录。")
    print()
    print("公钥（填入 .env.beta 的 LICENSE_PUBLIC_KEY）：")
    print(public_key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
