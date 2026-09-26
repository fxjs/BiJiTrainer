"""导出 ThinkBiJi Python 参考实现的三张牌强度，作为 TS 规则引擎的对拍基准。

输出 JSON 数组：按 itertools.combinations(range(54), 3) 的顺序，给出每个组合的强度整数。
参考实现路径可用环境变量 THINKBIJI_SIM 指定，默认 ../ThinkBiJi/sim（相对本仓库根目录）。
"""
import itertools
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIM = os.environ.get("THINKBIJI_SIM", os.path.join(ROOT, "..", "ThinkBiJi", "sim"))
sys.path.insert(0, SIM)
import biji_sim as S  # noqa: E402

out = [S.STRENGTH[c] for c in itertools.combinations(range(54), 3)]
json.dump(out, sys.stdout, separators=(",", ":"))
