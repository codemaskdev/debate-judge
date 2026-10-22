import sys, litellm
calls=[]
async def fake(*a, **kw):
    msgs = kw["messages"]; sysm=msgs[0]["content"]; usr=msgs[-1]["content"]
    tag = sysm.split(":")[0][-8:] if "SIDE" in sysm else sysm[:7]
    got = "TOPIC" if "Tabs or spaces" in usr else ("NOINPUT" if "No input" in usr else "TEXT")
    calls.append((tag, got, usr))
    return litellm.ModelResponse(choices=[{"message":{"role":"assistant","content":f"<{tag}>"}}], model=kw["model"])
litellm.acompletion = fake
from binex.cli.main import cli
try: cli(["run", sys.argv[1], "--var", "topic=Tabs or spaces?"], standalone_mode=False)
except SystemExit: pass
print("CALLS:", [(t,g) for t,g,_ in calls])
print("COLLECTOR SAW:", [c[2].replace("\n"," ") for c in calls if c[0]=="COLLECT"])
