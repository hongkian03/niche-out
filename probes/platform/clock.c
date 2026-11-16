#include <mach/mach_time.h>
#include <stdio.h>
#include <unistd.h>

// Side-by-side awake and continuous elapsed time; labels and values only.
int main(void) {
    mach_timebase_info_data_t base;
    if (mach_timebase_info(&base) != KERN_SUCCESS) return 1;
    const double ms_per_tick = (double)base.numer / base.denom / 1000000.0;
    const uint64_t start = mach_continuous_time();
    const uint64_t awake_start = mach_absolute_time();
    do {
        printf("%.3f %.3f\n", (mach_continuous_time() - start) * ms_per_tick,
               (mach_absolute_time() - awake_start) * ms_per_tick);
        fflush(stdout);
    } while (getchar() == '\n');
    return 0;
}
