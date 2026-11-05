import csv, numpy as np
rows=[r for r in csv.DictReader(open('sc.csv')) if r['position']=='3']
F=lambda r,k: float(r[k]) if r[k] else np.nan
rf=np.array([F(r,'rapid_fire') for r in rows]); acc=np.array([F(r,'accuracy') for r in rows])
ar=np.array([F(r,'accuracy_during_rapid') for r in rows]); sfr=np.array([F(r,'shots_fired_during_rapid') for r in rows]); sf=np.array([F(r,'shots_fired') for r in rows])
sh=acc*sf; shr=ar*sfr
non=(sh-shr)/(sf-sfr)
m=rf>0
print('share of scout games with rapid fire: %.1f%%'%(100*m.mean()))
print('accuracy no-rapid games: %.1f'%(100*np.nanmean(acc[~m])), ' rapid games: %.1f'%(100*np.nanmean(acc[m])))
print('within rapid games: accuracy during rapid %.1f, outside rapid %.1f'%(100*np.nansum(shr[m])/np.nansum(sfr[m]),100*np.nansum((sh-shr)[m])/np.nansum((sf-sfr)[m])))
print('share of shots fired during rapid (rapid games): %.1f%%'%(100*np.nansum(sfr[m])/np.nansum(sf[m])))
