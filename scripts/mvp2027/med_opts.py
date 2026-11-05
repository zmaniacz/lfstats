from med_grid import *
res=np.load('med_res.npy')
band=(res[:,12]>=14.5)&(res[:,12]<=15.5)&(res[:,11]>=9.5)&(res[:,11]<=11)&(res[:,13]>=19)&(res[:,13]<=21)
def best(mask,label):
    ok=res[band&mask]
    if not len(ok): print(label,'none'); return
    r=ok[np.argmax(ok[:,8]+ok[:,9])]; print(f'{label:34s}',' '.join(f'{x:g}' for x in r[:8]),'wp %.3f r %.3f Q1 %.2f med %.2f Q3 %.2f'%(r[8],r[9],r[11],r[12],r[13]))
for a in (0,0.025,0.05,0.075,0.1): best(res[:,0]==a,f'acc {a}')
best(res[:,7]==0,'no times-reset term')
best((res[:,7]==0)&(res[:,1]==0),'no treset, per-recipient boosts')
best((res[:,5]==2),'continuous survival')
show('current',mvp)
show('M: acc.1 recip1 sb2>1500 surv3 treset-.5',build(0.1,0,1,1500,2,'bin',3,-0.5))
show('M w/o times reset (recip1 sb2>1500 surv3)',build(0.1,0,1,1500,2,'bin',3,0))
show('M w/o times reset, sb2>1000',build(0.1,0,1,1000,2,'bin',3,0))
show('recip only',build(0.1,0,1,2000,2,'bin',2,0))
print('times reset per game: mean %.2f P90 %.0f'%(tr.mean(),np.percentile(tr,90)))
