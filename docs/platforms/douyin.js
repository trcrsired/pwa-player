class DouyinPlatform extends BasePlatform{static get name(){return"douyin"}static get domains(){return["*.douyin.com","douyin.com","*.iesdouyin.com","iesdouyin.com","v.douyin.com"]}static extractVideoId(t){if(t)try{var e=new URL(t),n=e.hostname;if("v.douyin.com"===n)return e.pathname.slice(1).split("?")[0];if(n.endsWith("douyin.com")||n.endsWith("iesdouyin.com")){if(e.pathname.startsWith("/video/")||e.pathname.startsWith("/note/"))return e.pathname.split("/")[2]?.split("?")[0];var i=e.searchParams.get("modal_id");if(i)return i}}catch(t){}return null}loadApi(){this.apiReady=!0}createPlayer(t,e,n={}){this.currentVideoId=t;e="string"==typeof e?document.getElementById(e):e;if(!e)return null;e.innerHTML="";var i=document.createElement("div"),e=(i.style.cssText=`
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #fff;
            background: #000;
            text-align: center;
            padding: 20px;
        `,i.innerHTML=`
            <div style="font-size: 24px; margin-bottom: 20px;">🎵 抖音视频</div>
            <div style="font-size: 14px; margin-bottom: 10px;">视频ID: ${t}</div>
            <div style="font-size: 12px; color: #888;">
                抖音暂不支持外部嵌入播放<br>
                请在抖音APP或网站中观看
            </div>
            <a href="${this.getVideoUrl(t)}" target="_blank" style="
                margin-top: 20px;
                padding: 10px 20px;
                background: #fe2c55;
                color: #fff;
                border-radius: 4px;
                text-decoration: none;
            ">打开抖音观看</a>
        `,e.appendChild(i),this.player=i,document.title="抖音视频 - PWA Player",navigator.mediaSession.metadata=new MediaMetadata({title:"抖音: "+t,artist:"抖音",album:"抖音"}),document.querySelector("#nowPlayingInfo .track-title")),i=document.querySelector("#nowPlayingInfo .track-artist"),o=document.querySelector("#nowPlayingInfo .track-url"),e=(e&&(e.textContent="抖音: "+t),i&&(i.textContent="抖音"),o&&(o.textContent=this.getVideoUrl(t)),document.getElementById("playBtn")),i=document.getElementById("npPlayBtn");return e&&(e.textContent="▶️"),i&&(i.textContent="▶️"),navigator.mediaSession.playbackState="paused",n.onReady&&n.onReady(),this.player}destroyPlayerInternal(){this.player&&this.player.parentNode&&this.player.parentNode.removeChild(this.player)}play(){}pause(){}togglePlayPause(){}stop(){this.destroyPlayer()}seekToPercent(t){}seekToTime(t){}setVolume(t){localStorage.setItem("volume",t.toString())}getCurrentTime(){return 0}getDuration(){return 0}getTitle(){return"抖音: "+this.currentVideoId}getVideoUrl(t){return t?"https://www.douyin.com/video/"+t:"抖音"}isPlaying(){return!1}}registerPlatform(DouyinPlatform),window.extractDouyinVideoId=DouyinPlatform.extractVideoId,window.isDouyinUrl=t=>DouyinPlatform.isUrl(t);