
let total = 0;
for(var i =0 ; i!=1000000;++i)
{
    total += i;
}

self.postMessage({total: total});